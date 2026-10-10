# /release-verify — turning a channel's check into commands

A `check` of `release.channels` is a sentence that names what must be true and, often, the command
that shows it. The kinds below cover the ones a repository pack writes; a check of another kind is
read as written and run with the same care (reads only).

| Kind | Commands | `published` when |
|---|---|---|
| GitHub release | `gh release view <tag> --repo <owner>/<repo> --json isDraft,isPrerelease,publishedAt,assets` | not a draft; prerelease exactly when the check says (for SemVer, a version holding `-`) |
| assets against checksums | `gh release view <tag> --json assets --jq '.assets[].name' > todo/release-<version>/assets/names.txt`; `gh release download <tag> --repo <owner>/<repo> --dir todo/release-<version>/assets --pattern '<manifest>'` for each manifest; then the repository's own checker when the check names one, with `--no-hash` (names only, nothing large downloaded) | the checker exits 0 |
| jobs of a run | the jobs read in § 2, matched by the names the check gives (a called workflow's jobs read `<caller job> / <job>`) | every one `success` |
| NuGet package | `curl -s https://api.nuget.org/v3-flatcontainer/<id lowercased>/index.json` | the version, lowercased, is in `versions`, for every id named |
| container image | `t=$(curl -s "https://ghcr.io/token?scope=repository:<owner>/<image>:pull" \| jq -r .token)`; `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $t" -H 'Accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.manifest.v1+json' https://ghcr.io/v2/<owner>/<image>/manifests/<version>` | `200` (an image that is not public answers `401`: `not checked`) |
| installed on another system | a paste from the user (§ 3 of the skill) | the paste shows the version installed and running |

Never pass a token on a command line you show; the anonymous registry token above is not a secret but
is not written to the record either. Nothing here writes outside `todo/release-<version>/`.
