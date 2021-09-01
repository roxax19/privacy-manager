#!/usr/bin/env bash
#HAY QUE MIRAR CUAL ES EL NUMERO DE NUESTRA INSTALACION
#mount | grep microk8s | head -1
sudo umount /snap/microk8s/2346
sudo unsquashfs /var/lib/snapd/snaps/microk8s_2346.snap