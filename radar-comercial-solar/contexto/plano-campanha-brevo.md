# Plano de Campanha — Brevo (E-mail)

## Lista no Brevo

Uma única lista: **Prospecção Armazenagem PE** (ID configurado em `.env`).

Todos os leads aprovados pelo painel entram nessa lista. A campanha de e-mail é disparada a partir dela no painel do Brevo.

Se a lista atual (ID 14) ainda estiver com outro nome no Brevo, renomeá-la para "Prospecção Armazenagem PE".

---

## Como o contato entra no Brevo

1. Radar encontra e qualifica o lead
2. Painel (`npm run radar:painel`) exibe a fila
3. Você revisa e clica em enviar para o lead desejado
4. O painel checa duplicata — local e no Brevo — antes de criar
5. Se novo: contato criado na lista "Prospecção Armazenagem PE"
6. Você dispara a campanha de e-mail pelo painel do Brevo

---

## Sequência de e-mails

| Toque | Timing | Conteúdo |
|---|---|---|
| E1 | D0 | Abordagem inicial personalizada (`templates/abordagem-email-armazenagem.md`) |
| E2 | D+7 sem resposta | Segundo ângulo: custo de montar estrutura própria vs. armazenagem contratada |
| E3 | D+18 sem resposta | Último toque curto — "se não for o momento, tudo bem" |
| Nutrição | D+19+ | Lista separada no Brevo, e-mail mensal sem pressão comercial |

---

## Checklist antes de enviar ao Brevo

```
[ ] Status campanha ≠ opt-out
[ ] Status campanha ≠ não interessado
[ ] Status campanha ≠ em conversa
[ ] Contato tem e-mail válido
[ ] Painel não retornou "duplicado"
```

---

## O que o Brevo gerencia sozinho

- Descadastro de e-mail (link automático em todo envio)
- Bloqueio de reenvio para quem descadastrou (`emailBlacklisted`)
- Histórico de abertura e clique por contato
- Bounces e e-mails inválidos

---

## O que você registra manualmente

| Evento | Ação |
|---|---|
| Respondeu ao e-mail | `Status campanha: em conversa` no lead |
| Não quer mais contato (e-mail) | Brevo cuida — não precisa fazer nada |
| Recusou explicitamente | `Status campanha: não interessado` |
| Fechou contrato | `Status campanha: cliente` |

---

## Limites do Brevo free

- 300 e-mails/dia — suficiente para o volume desta fase
- Sem automação de sequência no free — os toques E2 e E3 são enviados manualmente pelo painel do Brevo na data certa
- Listas e contatos ilimitados
