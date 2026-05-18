# Templates do Funil de Vendas Phenyx — Brevo

Complementa `campanha-e1-brevo.md`. Todos usam `{{contact.FIRSTNAME}}` = nome da empresa.

---

## E-Quente-Abriu
> Trigger: contato abriu E1 mas não clicou nem respondeu (Automação 2)

**Assunto:** Phenyx — posso apresentar melhor?

Olá, {{contact.FIRSTNAME}}.

Passei para ver se nossa mensagem chegou em bom momento — é comum que esse tipo de e-mail fique para depois e a conversa acabe não acontecendo.

Antes de propor qualquer coisa, quero entender a operação de vocês: como está a logística hoje? Têm armazenagem própria ou usam terceiros?

Uma conversa de 15 minutos já dá para ver se faz sentido avançar — sem compromisso.

Abraço,
[Nome]
Phenyx Logística
[Telefone]

---

## E-Proposta-Follow1
> Trigger: D+3 após adicionar à lista Proposta-Enviada

**Assunto:** {{contact.FIRSTNAME}} — conseguiu ver a proposta?

Olá, {{contact.FIRSTNAME}}.

Só passando para confirmar se a proposta chegou bem — às vezes vai para spam ou fica na fila de e-mails.

Se quiser que eu reenvie ou explique algum ponto, é só falar.

Abraço,
[Nome]
Phenyx Logística
[Telefone]

---

## E-Proposta-Follow2
> Trigger: D+7 após adicionar à lista Proposta-Enviada (sem resposta ao Follow1)

**Assunto:** Posso ajustar algo na proposta?

Olá, {{contact.FIRSTNAME}}.

Quero garantir que a proposta faça sentido para a realidade de vocês. Se algum volume, prazo ou serviço não encaixou, consigo adaptar antes de fechar qualquer coisa.

Me diga o que ficou faltando — ou se não for o momento certo, sem problema.

Abraço,
[Nome]
Phenyx Logística
[Telefone]

---

## E-Nurturing-01
> Trigger: mensal, para lista Fria-Nurturing (1ª terça do mês)
> Conteúdo: ROI de terceirizar armazenagem

**Assunto:** Quanto custa manter estoque próprio? (e quando vale terceirizar)

Olá, {{contact.FIRSTNAME}}.

Uma dúvida que aparece bastante em conversas com distribuidoras: **quando compensa terceirizar a armazenagem?**

A conta costuma mudar quando se coloca no papel:

- **Galpão próprio ou alugado:** aluguel, IPTU, seguro, manutenção e vigilância — mesmo nos meses de estoque baixo.
- **Equipe fixa:** salários, encargos e treinamento independem do volume movimentado.
- **Oportunidade:** capital imobilizado em infraestrutura que poderia estar em estoque, capital de giro ou expansão.

Com armazenagem terceirizada, você paga pelo que usa. Nos meses de pico, a estrutura está disponível. Nos meses fracos, o custo recua junto.

A Phenyx atende distribuidoras na região de Cabo de Santo Agostinho (PE) com esse modelo — estrutura completa, contrato flexível, sem custo fixo de galpão para o cliente.

Se quiser conversar sobre como funcionaria para a operação de vocês, é só responder este e-mail.

Abraço,
[Nome]
Phenyx Logística
[Telefone]

> *Você está recebendo este e-mail porque sua empresa pode ter fit com os serviços da Phenyx. Para não receber mais, basta responder com "remover".*

---

## E-Alerta-Interno
> Trigger: Automação 2 — contato abriu ou clicou em e-mail da campanha
> Destinatário: nicolas.micayo@phenyxprojetos.com.br
> Configurar como "Send an internal notification" no workflow do Brevo

**Assunto:** 🔥 Lead quente: {{contact.FIRSTNAME}}

---

**LEAD DEMONSTROU INTERESSE**

**Empresa:** {{contact.FIRSTNAME}}
**E-mail:** {{contact.EMAIL}}
**Telefone:** {{contact.SMS}}

**Ação recomendada:** entrar em contato nas próximas horas por telefone ou WhatsApp enquanto o interesse está fresco.

---

*Alerta gerado automaticamente pelo Brevo — Automação "Detecção Lead Quente"*

---

## Notas de configuração

| Template | Lista | Trigger | Delay |
|---|---|---|---|
| E-Quente-Abriu | #15 | Abriu E1 mas não clicou (Automação 2) | Imediato após abertura |
| E-Proposta-Follow1 | Proposta-Enviada | Entrada na lista | D+3 |
| E-Proposta-Follow2 | Proposta-Enviada | Sem resposta ao Follow1 | D+7 |
| E-Nurturing-01 | Fria-Nurturing | Mensal (1ª terça) | — |
| E-Alerta-Interno | — | Abertura ou clique no E1 | Imediato |
