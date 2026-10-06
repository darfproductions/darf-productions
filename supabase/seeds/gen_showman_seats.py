#!/usr/bin/env python3
"""Genera showman_seats_draft.csv a partir del croquis del Teatro de la Ciudad.

BORRADOR: cada fila se lee del PDF como (fin_izq, fin_centro, fin_der); los
asientos se numeran de corrido de izquierda a derecha. Los totales por zona se
comparan contra la tabla oficial; cualquier diferencia se imprime y debe
resolverse mirando el teatro/croquis ANTES de generar la migración de seed.
"""
import csv, sys

# zona: (categoría, total esperado, {fila: (fin_izq, fin_centro, fin_der)})
# Especial (naranja, Y-DD) y General (verde) NO existen: decisión de Johann.
ZONAS = {
  "Preferente": (469, {"X":(12,12,24),"W":(12,24,36),"V":(11,22,33),"U":(11,23,33),"T":(11,22,32),"S":(12,24,35),
                       "R":(12,23,34),"Q":(11,23,33),"P":(11,22,32),"O":(11,23,34),"N":(12,23,34),"M":(12,24,34),
                       "L":(11,22,32),"K":(11,23,32),"J":(0,11,11)}),
  "VIP": (200, {"I":(11,23,32),"H":(10,21,29),"G":(9,21,29),"F":(10,21,29),"E":(9,21,28),"D":(9,20,27),"C":(8,19,26)}),
  "Exclusivo": (50, {"B":(8,19,25),"A":(8,19,25)}),
}

rows, ok = [], True
for zona, (esperado, filas) in ZONAS.items():
    n = 0
    for fila, (ei, ec, ed) in filas.items():
        for num in range(1, ed + 1):
            lado = "izquierda" if num <= ei else "central" if num <= ec else "derecha"
            rows.append([zona, fila, num, f"{zona}-{fila}-{num}", lado])
            n += 1
    marca = "OK " if n == esperado else "REVISAR"
    if n != esperado: ok = False
    print(f"{marca} {zona:11s} leído={n:4d} esperado={esperado:4d} diff={n-esperado:+d}")
# Discapacitados: la fila J tiene 10, pero solo se habilitan 6 (3 por lado, como en el croquis).
for i in range(1, 7):
    rows.append(["Discapacitados", "J", i, f"Discapacitados-J-{i}", "izquierda" if i <= 3 else "derecha"])
print("OK  Discapacitados habilitados=6 (de 10 físicos; decisión de Johann)")
with open("supabase/seeds/showman_seats.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["categoria","fila","numero","etiqueta","lado"]); w.writerows(rows)
print(f"{len(rows)} asientos numerados escritos.")
sys.exit(0 if ok else 1)
