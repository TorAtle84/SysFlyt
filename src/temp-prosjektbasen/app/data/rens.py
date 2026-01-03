import re

def rens_fil(filnavn):
    try:
        with open(filnavn, 'r', encoding='utf-8') as f:
            innhold = f.read()
        
        # Bruk regex for å fjerne alle -mønstre
        renset_innhold = re.sub(r'\\s*', '', innhold)
        
        with open(filnavn, 'w', encoding='utf-8') as f:
            f.write(renset_innhold)
            
        print(f"✅ Filen '{filnavn}' er renset.")
    except FileNotFoundError:
        print(f"❌ Finner ikke filen '{filnavn}'.")

# Rens begge filene
rens_fil('krav.txt')
rens_fil('ikke_krav.txt')