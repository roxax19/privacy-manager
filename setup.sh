#!/bin/bash

#Installing microk8s
sudo apt update
sudo apt install snapd

sudo snap install microk8s --classic

sudo usermod -a -G microk8s $USER
sudo chown -f -R $USER ~/.kube

newgrp microk8s

# microk8s status --wait-ready

#Starting microk8s
#microk8s.start

#First step: enable addons
#microk8s.enable dns dashboard ingress storage metallb

#Second step: configure ingress for mqtt traffic
#microk8s.stop
#./extra/snpmk8/edit-ingress.sh

#Fourth step: change some file paths needed
python3 extra/setup/step4.py

microk8s.start

#Token para entrar en el dashboard
#token=$(microk8s kubectl -n kube-system get secret | grep default-token | cut -d " " -f1)
#microk8s kubectl -n kube-system describe secret $token