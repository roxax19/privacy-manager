#!/usr/bin/env bash
#HAY QUE MIRAR CUAL ES EL NUEMERO DE NUESTRA INSTALACION

string=$(snap info microk8s | grep installed)
echo $string

#Lo que yo quiero hacer es obtener la version de microk8s. Por lo tanto podría:
#buscar la expresion /snap/microk8s y obtener el indice
version="${string#*(}"
echo $version
# strip everything after the first ']', again, inclusive

version="${version%%\)*}"
echo $version

sudo mksquashfs squashfs-root microk8s_$version.snap
sudo cp microk8s_$version.snap /var/lib/snapd/snaps/microk8s_$version.snap
sudo mount -t squashfs -o ro,nodev,relatime,x-gdu.hide /var/lib/snapd/snaps/microk8s_$version.snap /snap/microk8s/$version
sudo rm -rf microk8s_$version.snap
sudo rm -rf squashfs-root