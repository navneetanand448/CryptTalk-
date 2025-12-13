#!/bin/bash
set -e

sudo apt update
sudo apt install -y nginx

npm ci || npm install
npm run build

sudo rm -rf /var/www/crypt-front
sudo mkdir -p /var/www/crypt-front
sudo cp -r dist/* /var/www/crypt-front/

sudo chown -R www-data:www-data /var/www/crypt-front
sudo chmod -R 755 /var/www/crypt-front

sudo cp nginx.config /etc/nginx/sites-available/crypt-front
sudo ln -sf /etc/nginx/sites-available/crypt-front /etc/nginx/sites-enabled/crypt-front
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx
