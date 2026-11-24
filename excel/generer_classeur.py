import datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

N = 1000  # rows prepared
F = "Arial"
H_FILL = PatternFill("solid", fgColor="0B7A75")
H_FONT = Font(name=F, bold=True, color="FFFFFF")
IN_FILL = PatternFill("solid", fgColor="FFFDE7")
CALC_FILL = PatternFill("solid", fgColor="EEF2F4")
EX_FONT = Font(name=F, italic=True, color="637580")
thin = Side(style="thin", color="D5DDE2")
BORDER = Border(bottom=thin)

INDICATIONS = ["Cataracte","Cataracte + DMLA","Cataracte + glaucome","Décollement de rétine",
 "Membrane épi-rétinienne","Trou maculaire","Hémorragie intra-vitréenne",
 "Rétinopathie diabétique proliférante","Endophtalmie","Luxation IOL / cristallin",
 "Aphakie","Œdème maculaire","Traction vitréo-maculaire","Corps flottants",
 "Huile de silicone en place","Autre"]
GESTES = ["Phacoémulsification + IOL en sac","Phacoémulsification + IOL sulcus",
 "Phacoémulsification + anneau de tension capsulaire","ECCE","MSICS",
 "Implantation secondaire","Implantation Carlevale","Implantation Artisan",
 "Suture sclérale IOL","Explantation IOL","Iridectomie","Synéchiolyse",
 "Capsulotomie au vitréotome","Vitrectomie 23G","Vitrectomie 25G","Vitrectomie 27G",
 "Pelage MLI","Pelage membrane épi-rétinienne","Échange fluide-air","Endolaser",
 "Cryoapplication","Rétinotomie","Perfluorocarbone liquide","Tamponnement air",
 "Tamponnement SF6","Tamponnement C2F6","Tamponnement C3F8",
 "Tamponnement huile de silicone","Ablation huile de silicone","Cerclage scléral",
 "Indentation segmentaire","Rétinopexie pneumatique","Injection intravitréenne","Autre"]
YEUX = ["OD","OG"]
TYPES = ["Cataracte","Vitréo-rétinien","Combinée","Autre"]
AIDES = ["(à compléter)"]

wb = Workbook()

# ---------- Mode d'emploi ----------
ws = wb.active; ws.title = "Mode d'emploi"
lines = [
 ("Suivi chirurgical – base de données", Font(name=F, bold=True, size=16, color="0B7A75")),
 ("", None),
 ("Comment l'utiliser", Font(name=F, bold=True, size=12)),
 ("1. Onglet « Patients » : une ligne par intervention (un patient opéré des deux yeux = deux lignes).", None),
 ("2. Donnez à chaque intervention un identifiant unique dans la colonne A (ex : P0001, P0002…).", None),
 ("3. Onglet « Consultations » : une ligne par consultation post-op. Choisissez l'ID dans la liste déroulante ;", None),
 ("    le nom, la date de chirurgie, le délai et la phase (< M1 / > M1) se remplissent tout seuls.", None),
 ("4. Onglet « Listes » : modifiez ou complétez les indications, gestes et aides opératoires. Les menus déroulants suivent.", None),
 ("", None),
 ("Code couleur", Font(name=F, bold=True, size=12)),
 ("Fond jaune pâle = à saisir · Fond gris = calculé automatiquement, ne pas modifier.", None),
 ("La ligne 2 de chaque onglet est un exemple : supprimez-la ou écrasez-la.", None),
 ("", None),
 ("Images et vidéos", Font(name=F, bold=True, size=12)),
 ("Rangez les fichiers dans un dossier par patient (Drive, OneDrive ou disque) et collez le lien dans la colonne « Lien médias ».", None),
 ("", None),
 ("Dans Google Sheets", Font(name=F, bold=True, size=12)),
 ("Drive → Nouveau → Importer un fichier → ouvrir avec Google Sheets (Fichier → Enregistrer au format Google Sheets).", None),
 ("", None),
 ("⚠ Données de santé", Font(name=F, bold=True, size=12, color="C1432C")),
 ("Un Google Drive ou OneDrive personnel n'est pas un hébergeur certifié HDS. Préférez un ID / n° de dossier et des initiales", None),
 ("plutôt que nom + prénom + date de naissance complets, ou stockez le fichier sur un espace validé par votre établissement.", None),
]
for i,(t,f) in enumerate(lines,1):
    c = ws.cell(row=i, column=1, value=t); c.font = f or Font(name=F)
ws.column_dimensions["A"].width = 130

# ---------- Listes ----------
wl = wb.create_sheet("Listes")
cols = [("Indications",INDICATIONS),("Gestes",GESTES),("Œil",YEUX),("Type",TYPES),("Aides opératoires",AIDES)]
for j,(name,vals) in enumerate(cols,1):
    c = wl.cell(row=1,column=j,value=name); c.font=H_FONT; c.fill=H_FILL
    for i,v in enumerate(vals,2):
        wl.cell(row=i,column=j,value=v).font=Font(name=F)
    wl.column_dimensions[get_column_letter(j)].width = 48 if j<=2 else 22
wl.freeze_panes = "A2"

def dv_list(col_letter, max_rows=200):
    return f"=Listes!${col_letter}$2:${col_letter}${max_rows}"

def header(ws, cols):
    for j,(name,width,kind) in enumerate(cols,1):
        c = ws.cell(row=1,column=j,value=name)
        c.font=H_FONT; c.fill=H_FILL
        c.alignment=Alignment(vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(j)].width = width
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{N+1}"

# ---------- Patients ----------
wp = wb.create_sheet("Patients", 1)
pcols = [
 ("ID",9,"in"),("Nom",16,"in"),("Prénom",14,"in"),("Date de naissance",13,"date"),
 ("Âge à la chirurgie",10,"calc"),("Œil",6,"in"),("Date chirurgie",13,"date"),
 ("Type",14,"in"),("Indication",28,"in"),("Geste 1",30,"in"),("Geste 2",30,"in"),
 ("Geste 3",30,"in"),("Geste 4",30,"in"),("Implant (modèle / puissance)",22,"in"),
 ("Aide opératoire",18,"in"),("Complications per-op",24,"in"),("Commentaires",36,"in"),
 ("Lien médias",28,"in"),("Nb consultations",11,"calc"),("Dernière consultation",13,"calc"),
]
header(wp, pcols)
for r in range(2, N+2):
    for j,(name,w,kind) in enumerate(pcols,1):
        c = wp.cell(row=r,column=j); c.font=Font(name=F); c.border=BORDER
        c.fill = CALC_FILL if kind=="calc" else IN_FILL
        if kind=="date": c.number_format="DD/MM/YYYY"
        if name in ("Commentaires","Complications per-op"): c.alignment=Alignment(wrap_text=True, vertical="top")
    wp[f"E{r}"] = f'=IF(OR(D{r}="",G{r}=""),"",DATEDIF(D{r},G{r},"y"))'
    wp[f"S{r}"] = f'=IF(A{r}="","",COUNTIF(Consultations!$A:$A,A{r}))'
    wp[f"T{r}"] = f'=IF(OR(A{r}="",S{r}=0),"",SUMPRODUCT(MAX((Consultations!$A$2:$A${N+1}=A{r})*Consultations!$D$2:$D${N+1})))'
    wp[f"T{r}"].number_format="DD/MM/YYYY"

# example row
ex_p = {"A":"P0001","B":"EXEMPLE","C":"Jean","D":dt.date(1950,3,14),"F":"OD",
        "G":dt.date(2026,11,3),"H":"Combinée","I":"Membrane épi-rétinienne",
        "J":"Phacoémulsification + IOL en sac","K":"Vitrectomie 25G",
        "L":"Pelage membrane épi-rétinienne","M":"Pelage MLI",
        "N":"Monofocal 21.5 D","O":"Dr X","P":"Aucune",
        "Q":"Ligne d'exemple – à supprimer","R":""}
for k,v in ex_p.items():
    wp[f"{k}2"] = v; wp[f"{k}2"].font = EX_FONT

dvs = [
 ("F", dv_list("C",10)), ("H", dv_list("D",20)), ("I", dv_list("A")),
 ("J", dv_list("B")),("K", dv_list("B")),("L", dv_list("B")),("M", dv_list("B")),
 ("O", dv_list("E")),
]
for col, src in dvs:
    dv = DataValidation(type="list", formula1=src, allow_blank=True, showErrorMessage=False)
    dv.error = None
    wp.add_data_validation(dv); dv.add(f"{col}2:{col}{N+1}")

# ---------- Consultations ----------
wc = wb.create_sheet("Consultations", 2)
ccols = [
 ("ID patient",10,"in"),("Patient",22,"calc"),("Date chirurgie",13,"calcdate"),
 ("Date consultation",13,"date"),("Délai (jours)",9,"calc"),("Délai",8,"calc"),
 ("Phase",8,"calc"),("AV OD",9,"in"),("AV OG",9,"in"),
 ("Réfraction OD",20,"in"),("Réfraction OG",20,"in"),("TO OD (mmHg)",9,"in"),
 ("TO OG (mmHg)",9,"in"),("OCT",26,"in"),("Examen (LAF / FO)",34,"in"),
 ("Complications post-op",24,"in"),("Notes",36,"in"),("Lien médias",28,"in"),
]
header(wc, ccols)
P = f"Patients!$A$2:$A${N+1}"
for r in range(2, N+2):
    for j,(name,w,kind) in enumerate(ccols,1):
        c = wc.cell(row=r,column=j); c.font=Font(name=F); c.border=BORDER
        c.fill = CALC_FILL if kind.startswith("calc") else IN_FILL
        if kind in ("date","calcdate"): c.number_format="DD/MM/YYYY"
        if name in ("Notes","Examen (LAF / FO)"): c.alignment=Alignment(wrap_text=True, vertical="top")
    m = f"MATCH(A{r},{P},0)"
    wc[f"B{r}"] = f'=IF(A{r}="","",IFERROR(INDEX(Patients!$B$2:$B${N+1},{m})&" "&INDEX(Patients!$C$2:$C${N+1},{m})&" – "&INDEX(Patients!$F$2:$F${N+1},{m}),"ID inconnu"))'
    wc[f"C{r}"] = f'=IF(A{r}="","",IFERROR(INDEX(Patients!$G$2:$G${N+1},{m}),""))'
    wc[f"E{r}"] = f'=IF(OR(C{r}="",D{r}=""),"",D{r}-C{r})'
    wc[f"E{r}"].number_format = "0"
    wc[f"F{r}"] = (f'=IF(E{r}="","",IF(E{r}<0,"Pré-op",IF(E{r}<7,"J"&E{r},'
                   f'IF(E{r}<30,"S"&ROUND(E{r}/7,0),IF(E{r}<365,"M"&ROUND(E{r}/30.44,0),'
                   f'"A"&TEXT(E{r}/365.25,"0.0"))))))')
    wc[f"G{r}"] = f'=IF(E{r}="","",IF(E{r}<30,"< M1","> M1"))'

ex_c = {"A":"P0001","D":dt.date(2026,11,4),"H":"2/10","I":"8/10",
        "J":"-0.50 (+0.75) 90°","K":"","L":"18","M":"15",
        "N":"Pas d'œdème, MER pelée","O":"Cornée claire, CA calme, rétine à plat",
        "P":"Aucune","Q":"Ligne d'exemple – à supprimer"}
for k,v in ex_c.items():
    wc[f"{k}2"] = v; wc[f"{k}2"].font = EX_FONT
dv = DataValidation(type="list", formula1=f"={P}", allow_blank=True, showErrorMessage=False)
wc.add_data_validation(dv); dv.add(f"A2:A{N+1}")

wb.active = 1
out = "/home/user/Suivi-chirurgical/excel/suivi-chirurgical.xlsx"
wb.save(out); print(out)
