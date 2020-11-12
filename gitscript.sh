#!/bin/bash

commitmsg=''
user='roxax19'
#password='b8516836f1a961a990a863d7d472f90510068f94'

while getopts 'm:' flag; do
    case "${flag}" in
        m) commitmsg="${OPTARG}" ;;
    esac
done

while read line
do password=$line
done < ../tokengit

git status
git add .
git commit -m "${commitmsg}"
printf "%s\n%s\n" "$user" "$password"
# | git push
