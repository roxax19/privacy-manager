#!/bin/bash

#Starting microk8s
#micro8s.start

#First step: enable addons
#microk8s.enable dns dashboard ingress storage metallb

#Second step: configure ingress for mqtt traffic
#microk8s.stop
#./extra/snpmk8/edit-ingress.sh

#Fourth step: change some file paths needed
python3 extra/setup/step4.py
