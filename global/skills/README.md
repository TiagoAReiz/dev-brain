# Skills

Uma pasta por skill, cada uma com um `SKILL.md`:

```
global/skills/
└── minha-skill/
    ├── SKILL.md        # obrigatório
    └── ...             # scripts, referências etc. (opcional)
```

`SKILL.md` começa com frontmatter YAML:

```markdown
---
name: minha-skill
description: O que faz e QUANDO usar (é isso que o agente lê para decidir se ativa).
---

# Minha skill
Instruções...
```

O `bootstrap.sh` cria um symlink de cada pasta daqui em `~/.claude/skills/<nome>`.
Depois de adicionar uma skill, rode `./bootstrap.sh` de novo.
