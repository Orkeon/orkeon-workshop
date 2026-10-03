#!/bin/bash
# Outbound allow-list firewall of the Orkeon Workshop container.
#
# Provenance: most of this script comes from the reference devcontainer of the Claude Code
# repository (https://github.com/anthropics/claude-code), (c) Anthropic PBC, all rights
# reserved. Those parts are not covered by the MIT licence of this project: see
# THIRD-PARTY-NOTICES.md at the root of the repository. The project added the optional extra
# domains, two package hosts, and the rules for the Docker networks, SonarQube and Ollama.
set -euo pipefail  # Exit on error, undefined vars, and pipeline failures
IFS=$'\n\t'       # Stricter word splitting

# 1. Extract Docker DNS info BEFORE any flushing
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

# Flush existing rules and delete existing ipsets
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

# 2. Selectively restore ONLY internal Docker DNS resolution
if [ -n "$DOCKER_DNS_RULES" ]; then
    echo "Restoring Docker DNS rules..."
    iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
    iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
    echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
else
    echo "No Docker DNS rules to restore"
fi

# First allow DNS and localhost before any restrictions
# Allow outbound DNS
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
# Allow inbound DNS responses
iptables -A INPUT -p udp --sport 53 -j ACCEPT
# Allow outbound SSH
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
# Allow inbound SSH responses
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
# Allow localhost
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Create ipset with CIDR support
ipset create allowed-domains hash:net

# Fetch GitHub meta information and aggregate + add their IP ranges
echo "Fetching GitHub IP ranges..."
gh_ranges=$(curl -s https://api.github.com/meta)
if [ -z "$gh_ranges" ]; then
    echo "ERROR: Failed to fetch GitHub IP ranges"
    exit 1
fi

if ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null; then
    echo "ERROR: GitHub API response missing required fields"
    exit 1
fi

echo "Processing GitHub IPs..."
while read -r cidr; do
    if [[ ! "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
        echo "ERROR: Invalid CIDR range from GitHub meta: $cidr"
        exit 1
    fi
    echo "Adding GitHub range $cidr"
    ipset add allowed-domains "$cidr"
done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | aggregate -q)

# Resolve and add other allowed domains
for domain in \
    "registry.npmjs.org" \
    "api.anthropic.com" \
    "sentry.io" \
    "statsig.com" \
    "marketplace.visualstudio.com" \
    "vscode.blob.core.windows.net" \
    "update.code.visualstudio.com" \
    "packages.microsoft.com" \
    "download.docker.com"; do
    echo "Resolving $domain..."
    ips=$(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}')
    if [ -z "$ips" ]; then
        echo "ERROR: Failed to resolve $domain"
        exit 1
    fi
    
    while read -r ip; do
        if [[ ! "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
            echo "ERROR: Invalid IP from DNS for $domain: $ip"
            exit 1
        fi
        echo "Adding $ip for $domain"
        # -exist: a name can answer the same address twice, and two names can share one
        ipset add -exist allowed-domains "$ip"
    done < <(echo "$ips")
done

# Optional extra domains, space- or comma-separated in FIREWALL_EXTRA_DOMAINS (see README:
# NuGet restores, Ollama model pulls). Off by default — every entry widens the allowlist,
# and CDN-hosted names resolve to addresses shared with unrelated sites. Best effort: an
# unresolvable name is skipped, an address already in the set is not an error.
for domain in $(printf '%s' "${FIREWALL_EXTRA_DOMAINS:-}" | tr ', ' '\n\n'); do
    [ -n "$domain" ] || continue
    echo "Resolving extra domain $domain..."
    ips=$(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}')
    if [ -z "$ips" ]; then
        echo "WARNING: Failed to resolve extra domain $domain - skipped"
        continue
    fi
    while read -r ip; do
        if [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
            echo "Adding $ip for $domain"
            ipset add -exist allowed-domains "$ip"
        fi
    done < <(echo "$ips")
done

# Allow Docker bridge network traffic (for SonarQube and other containers)
# Docker typically uses 172.17.0.0/16 and 172.18.0.0/16 for bridge networks
for docker_net in "172.17.0.0/16" "172.18.0.0/16" "172.19.0.0/16"; do
    iptables -A INPUT -s "$docker_net" -j ACCEPT
    iptables -A OUTPUT -d "$docker_net" -j ACCEPT
done

# Allow traffic to SonarQube on localhost port 9000
iptables -A OUTPUT -p tcp --dport 9000 -d 127.0.0.1 -j ACCEPT
iptables -A INPUT -p tcp --sport 9000 -s 127.0.0.1 -j ACCEPT

# Get host IP from default route
HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -z "$HOST_IP" ]; then
    echo "ERROR: Failed to detect host IP"
    exit 1
fi

HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
echo "Host network detected as: $HOST_NETWORK"

# Set up remaining iptables rules
iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT

# In host-socket mode, SonarQube is a sibling on the HOST and the entrypoint forwards
# 127.0.0.1:9000 -> host.docker.internal:9000. The forwarder's upstream leg leaves the
# container toward whatever gateway host-gateway resolves to (varies by platform), so we
# allow outbound to port 9000 regardless of destination rather than pinning a single IP.
# Responses are covered by the ESTABLISHED,RELATED rule below. Harmless in DinD mode.
if [ "${DOCKER_MODE:-dind}" = "socket" ]; then
    echo "Allowing outbound SonarQube traffic (tcp/9000) for host-socket mode"
    iptables -A OUTPUT -p tcp --dport 9000 -j ACCEPT
fi

# OLLAMA_MODE=host: init-orkeon.sh forwards 127.0.0.1:11434 -> host.docker.internal:11434
# to reuse the host's Ollama. Same reasoning as the SonarQube rule above.
if [ "${OLLAMA_MODE:-local}" = "host" ]; then
    echo "Allowing outbound Ollama traffic (tcp/11434) for OLLAMA_MODE=host"
    iptables -A OUTPUT -p tcp --dport 11434 -j ACCEPT
fi

# Set default policies to DROP first
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# First allow established connections for already approved traffic
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Then allow only specific outbound traffic to allowed domains
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

# Explicitly REJECT all other outbound traffic for immediate feedback
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

echo "Firewall configuration complete"
echo "Verifying firewall rules..."
if curl --connect-timeout 5 https://example.com >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed - was able to reach https://example.com"
    exit 1
else
    echo "Firewall verification passed - unable to reach https://example.com as expected"
fi

# Verify GitHub API access
if ! curl --connect-timeout 5 https://api.github.com/zen >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed - unable to reach https://api.github.com"
    exit 1
else
    echo "Firewall verification passed - able to reach https://api.github.com as expected"
fi
