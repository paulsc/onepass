# onepass
1Password client for linux

## why
This adds support for the new [OPVault](https://support.1password.com/opvault-design/) data format and has basic support for the 1Password browser extension. 

## install
Build the gtkmenu using `./build-gtkmenu.sh` and run using `node 1pass`

## run 
Use --prompt for command line mode. Or no option to start browser extension mode. 

```
~/workspace/onepass$ node 1pass.js --prompt
info: Unlocking vault...
Password: 
Keychain unlocked.

Keyword: gmail
```
