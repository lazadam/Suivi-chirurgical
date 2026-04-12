# Suivi chirurgical

Application locale de suivi des patients opérés, conçue pour la chirurgie ophtalmologique (cataracte et chirurgie vitréo-rétinienne).

## Fonctionnalités

- **Fiche patient** : nom, prénom, date de naissance, œil opéré
- **Intervention** : date, indication, geste(s) chirurgical(aux) (presets cataracte et VR), aide opératoire, commentaires
- **Suivi post-opératoire précoce (< M1)** : AV, tonus, OCT, examen, notes
- **Évolution long terme (> M1)** : mêmes champs, séparation automatique selon la date
- **Images et vidéos** : ajout de fichiers joints (photos, vidéos, OCT…) stockés localement
- **Recherche et filtres** : par nom, indication, type de chirurgie
- **Export / Import** : sauvegarde JSON complète (incluant les médias en base64)

## Utilisation

1. Ouvrir `index.html` dans un navigateur moderne (Chrome, Firefox, Edge, Safari)
2. Aucune installation ni serveur requis

Les données sont stockées dans le navigateur via **IndexedDB**. Elles persistent entre les sessions tant que vous ne videz pas les données du navigateur.

## Sauvegarde

**Pensez à exporter régulièrement vos données** via le bouton « Exporter ». Le fichier JSON généré contient l'intégralité des patients, consultations et fichiers joints. Vous pouvez le réimporter à tout moment.

## Avertissement – Données de santé

Cette application stocke les données **localement dans votre navigateur**. Les données ne transitent par aucun serveur.

Cependant, cet outil est conçu comme un **aide-mémoire personnel** et ne constitue pas un logiciel médical certifié. Il ne remplace pas un dossier médical électronique conforme aux réglementations en vigueur (RGPD, HDS).

- Ne stockez pas de données permettant l'identification directe des patients sur un poste partagé
- Protégez l'accès à votre ordinateur (mot de passe, chiffrement du disque)
- Effectuez des sauvegardes régulières (export JSON)

## Structure du projet

```
index.html   – Page principale
styles.css   – Feuille de styles
db.js        – Couche d'accès IndexedDB
app.js       – Logique applicative et interface
```
