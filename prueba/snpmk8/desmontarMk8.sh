#!/usr/bin/env bash
#HAY QUE MIRAR CUAL ES EL NUMERO DE NUESTRA INSTALACION
#mount | grep microk8s
sudo umount /snap/microk8s/1422 
sudo unsquashfs /var/lib/snapd/snaps/microk8s_1422.snap