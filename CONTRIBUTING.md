# Contributing to AppFlow

🎉 Merci de votre intérêt pour contribuer à AppFlow ! Ce guide vous aidera à commencer.

## 🚀 Comment contribuer

### Signaler des bugs

1. Vérifiez d'abord si le bug n'a pas déjà été signalé dans les [issues](https://github.com/kihw/appflow/issues)
2. Créez une nouvelle issue avec :
   - Un titre descriptif
   - Les étapes pour reproduire le bug
   - Le comportement attendu vs. le comportement observé
   - Votre environnement (OS, versions Python/Node.js)
   - Captures d'écran si applicable

### Proposer des nouvelles fonctionnalités

1. Créez une issue avec le label "enhancement"
2. Décrivez clairement la fonctionnalité souhaitée
3. Expliquez pourquoi cette fonctionnalité serait utile
4. Proposez une implémentation si possible

### Contribuer du code

1. **Fork** le repository
2. **Clone** votre fork localement
3. Créez une **branche** pour votre fonctionnalité
4. **Développez** et **testez** vos modifications
5. **Commit** vos changements avec un message descriptif
6. **Push** vers votre fork
7. Créez une **Pull Request**

## 🛠️ Configuration de l'environnement de développement

### Prérequis

- Python 3.10+
- Node.js 18+
- npm ou yarn
- Git

### Installation

```bash
# Cloner le repository
git clone https://github.com/kihw/appflow.git
cd appflow

# Installer les dépendances
python build.py deps

# Ou manuellement :
cd main && pip install -r requirements.txt
cd ../frontend && npm install
```

### Lancer en mode développement

```bash
# Démarrer le backend
cd main
python appflow.py --log ../appflow.log

# Dans un autre terminal, démarrer le frontend
cd frontend
npm run dev
```

### Tests

```bash
# Lancer tous les tests
python build.py test

# Tests Python seulement
cd main
python -m unittest discover tests

# Tests frontend (si configurés)
cd frontend
npm test
```

## 📝 Standards de code

### Python

- Suivez [PEP 8](https://pep8.org/)
- Utilisez `black` pour le formatage : `black .`
- Utilisez `isort` pour trier les imports : `isort .`
- Ajoutez des docstrings pour les fonctions/classes
- Utilisez les type hints quand possible

```python
def example_function(param: str, count: int = 1) -> bool:
    """
    Exemple de fonction bien documentée.
    
    Args:
        param: Description du paramètre
        count: Nombre d'itérations (défaut: 1)
    
    Returns:
        True si succès, False sinon
    """
    pass
```

### JavaScript/TypeScript

- Utilisez ESLint pour la qualité du code
- Préférez `const` et `let` plutôt que `var`
- Utilisez des noms de variables descriptifs
- Commentez les parties complexes

```javascript
// Bon exemple
const ruleEngine = new RuleEngine(rules);
const isEngineRunning = await ruleEngine.start();

// Évitez
var re = new RuleEngine(r);
var running = await re.start();
```

### Messages de commit

Utilisez le format [Conventional Commits](https://www.conventionalcommits.org/) :

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types :**
- `feat`: nouvelle fonctionnalité
- `fix`: correction de bug
- `docs`: documentation
- `style`: formatage, point-virgules manquants, etc.
- `refactor`: refactoring du code
- `test`: ajout/modification de tests
- `chore`: maintenance, build, etc.

**Exemples :**
```
feat(rules): add cooldown mechanism for rules
fix(ui): correct button alignment in rule modal
docs: update installation instructions
test(engine): add unit tests for rule validation
```

## 🏗️ Architecture du projet

```
appflow/
├── main/                   # Backend Python
│   ├── core/              # Logique métier
│   │   └── rule_engine.py # Moteur de règles
│   ├── utils/             # Utilitaires
│   │   ├── system.py      # Fonctions système
│   │   ├── logger.py      # Logging
│   │   └── workflow_suggestions.py
│   ├── tests/             # Tests unitaires
│   └── appflow.py         # Point d'entrée
├── frontend/              # Interface Electron
│   ├── main.js           # Processus principal Electron
│   ├── public/           # Fichiers statiques
│   │   ├── index.html    # Interface utilisateur
│   │   ├── renderer.js   # Logique frontend
│   │   └── rules/        # Règles YAML
│   └── package.json      # Configuration Node.js
├── .github/              # GitHub Actions
├── build.py              # Script de build
└── README.md
```

## 🧪 Tests

### Tests Python

- Placez les tests dans `main/tests/`
- Nommez les fichiers `test_*.py`
- Utilisez `unittest` ou `pytest`
- Visez une couverture de code > 80%

```python
import unittest
from core.rule_engine import Rule

class TestRule(unittest.TestCase):
    def test_rule_creation(self):
        rule_data = {'name': 'Test', 'triggers': [], 'actions': []}
        rule = Rule(rule_data)
        self.assertEqual(rule.name, 'Test')
```

### Tests Frontend

- Tests unitaires pour les fonctions utilitaires
- Tests d'intégration pour les workflows
- Tests end-to-end avec Playwright (à venir)

## 🔍 Review Process

### Critères pour les Pull Requests

1. **Code Quality**
   - ✅ Code formaté et linté
   - ✅ Tests passants
   - ✅ Couverture de code maintenue
   - ✅ Documentation à jour

2. **Fonctionnalité**
   - ✅ Fonctionne comme décrit
   - ✅ Pas de régression
   - ✅ Interface utilisateur intuitive
   - ✅ Performance acceptable

3. **Sécurité**
   - ✅ Pas de vulnérabilités introduites
   - ✅ Validation des entrées utilisateur
   - ✅ Pas d'exposition de données sensibles

### Process de review

1. **Création de la PR**
   - Titre descriptif
   - Description détaillée des changements
   - Références aux issues liées
   - Screenshots si applicable

2. **Review automatique**
   - Tests CI/CD passants
   - Vérifications de sécurité
   - Analyse de code

3. **Review humaine**
   - Au moins une approbation requise
   - Feedback constructif
   - Suggestions d'amélioration

4. **Merge**
   - Squash and merge préféré
   - Message de commit propre
   - Suppression de la branche source

## 🎯 Domaines de contribution

### 🔧 Backend (Python)

- **Nouveaux déclencheurs** : détection de fichiers, événements réseau, etc.
- **Nouvelles actions** : intégrations API, notifications avancées
- **Performance** : optimisation du polling, cache intelligent
- **Sécurité** : chiffrement des configurations, sandbox pour les actions

### 🎨 Frontend (Electron)

- **UX/UI** : amélioration de l'interface, thèmes, animations
- **Éditeur visuel** : drag & drop amélioré, validation en temps réel
- **Tableaux de bord** : métriques, graphiques, historique
- **Accessibilité** : support clavier, lecteurs d'écran

### 📚 Documentation

- **Guides utilisateur** : tutoriels, cas d'usage
- **API Documentation** : documentation des modules Python
- **Vidéos** : screencasts, démonstrations
- **Traductions** : support multilingue

### 🧪 Tests & Qualité

- **Tests end-to-end** : automatisation complète
- **Tests de performance** : benchmarks, profiling
- **Tests multi-plateformes** : Windows, macOS, Linux
- **Fuzzing** : tests de robustesse

## 🐛 Debugging

### Logs utiles

```bash
# Logs détaillés du backend
python appflow.py --log debug.log --interval 1

# Logs Electron (dans DevTools)
# Ouvrir DevTools : Ctrl+Shift+I (Windows/Linux) ou Cmd+Opt+I (macOS)
```

### Problèmes courants

**Le moteur ne démarre pas :**
- Vérifiez les permissions d'exécution
- Vérifiez que Python est dans le PATH
- Consultez les logs d'erreur

**Les règles ne s'exécutent pas :**
- Vérifiez la syntaxe YAML
- Vérifiez les permissions de fichier
- Activez les logs détaillés

**Interface ne se charge pas :**
- Vérifiez que Node.js est installé
- Reconstruisez les dépendances : `npm ci`
- Vérifiez les logs du processus principal

## 🤝 Code de conduite

- Soyez respectueux et inclusif
- Acceptez les critiques constructives
- Concentrez-vous sur ce qui est le mieux pour la communauté
- Montrez de l'empathie envers les autres membres

## 🎉 Reconnaissance

Les contributeurs sont reconnus dans :
- Le fichier README.md
- Les notes de version
- Les commits et Pull Requests
- La page "Contributors" du repository

Merci de contribuer à AppFlow ! 🚀

---

Pour toute question, n'hésitez pas à :
- Créer une issue sur GitHub
- Rejoindre les discussions
- Contacter les mainteneurs

**Happy coding! 🎯**
