You can change the certificate used in TLS by Ingress.
First, you have to create a secret with the cert in your kubernetes cluster. You can add it with this command:
```
kubectl create secret tls ${CERT_NAME} --key ${KEY_FILE} --cert ${CERT_FILE}
```

Then, you need to add this line in your Ingress Controller:
```
#This goes inside the DaemonSet
kind: DaemonSet
metadata:
  ...
spec:
  ...
  template:
    ...
    spec:
      ...
      containers:
        ...
        args
        ...
        - --default-ssl-certificate=default/${CERT_NAME}
```

