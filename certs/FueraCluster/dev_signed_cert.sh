#!/usr/bin/env bash
#
# Usage: dev_signed_cert.sh HOSTNAME
#
# Creates a CA cert and then generates an SSL certificate signed by that CA for the
# given hostname.
#
# After running this, add the generated dev_cert_ca.cert.pem to the trusted root
# authorities in your browser / client system.
#

set -x

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
NAME=${1:-localhost}

CA_KEY=$DIR/myCA.key
CA_CERT=$DIR/myCA.pem

HOST_KEY=$DIR/$NAME.key

[ -f $HOST_KEY ] || openssl genrsa -out $HOST_KEY 2048

openssl rsa -in $HOST_KEY -out $HOST_KEY-nopass.key

HOST_CERT=$DIR/$NAME.crt

if ! [ -f $HOST_CERT ] ; then
    HOST_CSR=$DIR/$NAME.csr
    [ -f $HOST_CSR ] || openssl req -new -key $HOST_KEY -out $HOST_CSR
    HOST_EXT=$DIR/$NAME.ext

    if ! [ -f $HOST_EXT ] ; then
        echo >$HOST_EXT
        echo >>$HOST_EXT authorityKeyIdentifier=keyid,issuer
        echo >>$HOST_EXT basicConstraints=CA:FALSE
        echo >>$HOST_EXT keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
        echo >>$HOST_EXT subjectAltName = @alt_names
        echo >>$HOST_EXT
        echo >>$HOST_EXT [alt_names]

        NAME_N=1
        for ALT_NAME in "$@" ; do
            echo >>$HOST_EXT DNS.$NAME_N = $NAME
            NAME_N=$(( NAME_N + 1 ))
        done
    fi

    openssl x509 -req -in $HOST_CSR -CA $CA_CERT -CAkey $CA_KEY -CAcreateserial \
        -out $HOST_CERT -days 365 -sha256 -extfile $HOST_EXT

fi


