ingress_file = open("squashfs-root/actions/ingress.yaml", "r")
list_lines = ingress_file.readlines()

aux_index_1=0
aux_index_2=0
cont=True

text1="""apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-ingress-tcp-microk8s-conf
  namespace: ingress
#Anadimos el servicio que queremos exponer
data:
  1883: "default/mosquitto-broker:1883"
---
"""

text2="""#Anadimos el servicio que queremos exponer
        - name: prxy-tcp-8083
          containerPort: 8083
          hostPort: 1883
          protocol: TCP
"""

## Primera modificacion

#buscamos la primera fila de configmap
for i in range (len(list_lines)):
    if "kind: ConfigMap" in list_lines[i]:
        #nos quedamos con el número de linea        
        aux_index_1=i
        print("indice 1:")
        print(aux_index_1)

for i in range(aux_index_1, len(list_lines)) :
    #buscamos la siguiente linea del tipo ---
    if "---" in list_lines[i] and cont :
        aux_index_2=i
        cont=False
        print("indice 2:")
        print(aux_index_2)


list_lines.insert(aux_index_2+1, text1)

## Segunda modificacion
cont=True

for i in range (len(list_lines)):
    if "kind: DaemonSet" in list_lines[i]:
        #nos quedamos con el número de linea        
        aux_index_1=i
        print("indice 1:")
        print(aux_index_1)

for i in range(aux_index_1, len(list_lines)) :
    #buscamos la siguiente linea 
    if "        - containerPort: 443" in list_lines[i] and cont :
        aux_index_2=i
        cont=False
        print("indice 2:")
        print(aux_index_2)

list_lines.insert(aux_index_2+1, text2)

ingress_file_write = open("squashfs-root/actions/ingress.yaml", "w")
list_lines = "".join(list_lines)
ingress_file_write.write(list_lines)