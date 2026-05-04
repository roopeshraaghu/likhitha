ano setup-ssl.sh

# Then run it on EC2 1
scp setup-ssl.sh ubuntu@<EC2-1-IP>:~/
ssh ubuntu@<EC2-1-IP>
sudo bash setup-ssl.sh