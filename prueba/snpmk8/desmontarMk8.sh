#!/usr/bin/env bash
mount | grep microk8s
sudo umount /snap/microk8s/1668 
sudo unsquashfs /var/lib/snapd/snaps/microk8s_1668.snap
