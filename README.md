# onepass
1Password client for linux

## why
This adds support for the new [OPVault](https://support.1password.com/opvault-design/) data format and has basic support for the 1Password browser extension. 

## install

  
```
# Install GTK libs
apt-get install libgtk-3-dev

# Build the gtkmenu  
./build-gtkmenu.sh

# Symlink your 1Password directory  
ln -s ~/Path/to/your/1Password .

# Install dependencies  
npm install

# Run the app
# Use --prompt for command line mode. 
# Or no option to start browser extension mode. 
node 1pass.js --prompt

info: Unlocking vault...
Password: 
Keychain unlocked.

Keyword: gmail
```
