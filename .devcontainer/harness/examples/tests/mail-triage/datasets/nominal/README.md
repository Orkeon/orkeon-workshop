# Dataset `nominal`

Twelve mails: 3 support, 2 sales, 2 billing with a PDF attachment, 1 internal, 1 newsletter, 2 spam, 1 other; 8 in English and 4 in French; 5 call for a draft (`mail-01`, `mail-02`, `mail-04`, `mail-05`, `mail-07`); `mail-01` names an outage and `mail-07` a deadline the next day. Each mail ends with a marker sentence of its own (AC-10, INV-01). `mail-12` fits no business category: its record is `other` / `medium` (R-09, AC-16).

Synthetic: every mail is made up and every address is under `example.com`, `example.org` or `example.net`. Written by `datasets/generate.py`: change the generator, not these files.
