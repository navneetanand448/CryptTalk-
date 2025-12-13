#!/bin/bash

sudo apt update
sudo apt install -y nginx nodejs npm

npm ci || npm install

sudo npm install -g pm2
pm2 start app.js --name crypt-backend
pm2 save
pm2 startup
