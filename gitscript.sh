#!/bin/bash

commitmsg=''

while getopts 'm:' flag; do
    case "${flag}" in
        m) commitmsg="${OPTARG}" ;;
    esac
done

git status
git add .
git commit -m "${commitmsg}"
git push
