# Gestão - Pós V4

PRD MVP - Sistema de Gestão de Escalas e Alocação de Equipes

Visão Geral

Desenvolver uma aplicação web para gestão operacional de equipes, substituindo o controle realizado atualmente em planilhas.

O sistema deverá permitir que gestores visualizem, organizem e planejem escalas de trabalho de forma simples, rápida e altamente visual.

O foco desta primeira versão é construir o núcleo da aplicação, com ênfase total na tela de Escala Operacional.

A experiência da Escala Operacional é a prioridade absoluta do projeto e deve receber mais atenção do que as telas de cadastro.

Objetivo do MVP

Permitir que um gestor consiga:

Cadastrar colaboradores

Cadastrar funções

Cadastrar programas/projetos

Cadastrar ilhas (estações de trabalho)

Montar escalas operacionais

Visualizar rapidamente onde cada colaborador está alocado

Planejar ocupação futura da equipe

Consultar a ocupação por período

Estrutura da Aplicação

Criar uma aplicação web responsiva com menu lateral.

Itens do menu:

Escala Operacional

Pessoas

Funções

Programas

Ilhas

A tela inicial deverá ser a Escala Operacional.

Conceito Principal

A Escala Operacional é o coração do sistema.

A experiência deve ser semelhante a uma combinação entre:

Excel

Airtable

Monday.com

Planejamento de recursos (Resource Planning)

Cada linha representa um colaborador.

Cada coluna representa uma data.

O gestor deve conseguir compreender toda a ocupação da equipe apenas observando a grade principal.

Tela Principal - Escala Operacional

Estrutura da Grade

Primeira Coluna (Congelada)

A primeira coluna deverá permanecer fixa durante toda a navegação horizontal.

Ela deve exibir:

Nome do colaborador

Função

Exemplo:

EDITOR 1
Finalizador

EDITOR 2
Editor

EDITOR 3
Editor

Mesmo navegando por meses ou anos futuros, essa coluna deve permanecer visível.

Colunas de Datas

Cada coluna representa um dia.

Exemplo:

01/06
02/06
03/06
04/06
05/06

Navegação Temporal

A escala deve funcionar como uma timeline contínua.

Não deve existir limitação de calendário.

O usuário deve conseguir navegar livremente por:

Dias futuros

Meses futuros

Anos futuros

Datas passadas

A navegação deve ser dinâmica.

Disponibilizar:

Botão período anterior

Botão próximo período

Seletor de data

Campo para salto rápido de período

Exemplos:

Ir para Janeiro de 2027

Ir para Junho de 2028

Voltar para Março de 2025

O sistema deve carregar automaticamente qualquer período solicitado.

Modos de Visualização

Permitir alternar entre:

Diário

Visualização detalhada de um único dia.

Semanal

Visualização de uma semana completa.

Mensal

Visualização de um mês completo.

A troca deve ocorrer através de um seletor localizado acima da grade.

Planejamento de Longo Prazo

A escala não deve ser limitada ao uso operacional diário.

Ela deve permitir planejamento futuro.

O gestor deve conseguir:

Planejar semanas futuras

Planejar meses futuros

Planejar anos futuros

A estrutura deve suportar crescimento contínuo sem limitações de calendário.

Informações exibidas em cada célula

Cada célula da escala deverá exibir:

Horário

14:00 às 23:00

Programa

Jornal Nacional

Modalidade

TV ou Home Office

Ilha

Ilha 01

Status

Trabalhando
Folga
Folga Semanal

Identificação Visual

Cada programa deverá possuir uma cor configurável.

Exemplos:

Jornal Nacional → Azul

Esporte → Verde

Reality Show → Roxo

Podcast → Laranja

A cor deverá ser aplicada automaticamente na célula da escala.

Objetivo:

Permitir identificação visual imediata das alocações.

Cadastro de Pessoas

Criar tela contendo:

Nome

Função

Status

Funcionalidades:

Criar

Editar

Excluir

Pesquisar

Cadastro de Funções

Criar tela contendo:

Nome da função

Exemplos:

Editor

Finalizador

Operador

Produtor

Cadastro de Programas

Criar tela contendo:

Nome

Sigla

Cor de identificação

A cor será utilizada automaticamente na escala.

Cadastro de Ilhas

Criar tela contendo:

Nome da ilha

Descrição

Exemplos:

Ilha 01

Ilha 02

Ilha 03

Cadastro de Escala

Ao clicar em uma célula vazia da grade, abrir um modal.

Campos:

Pessoa

Programa

Ilha

Data

Hora início

Hora fim

Modalidade

Status

Todos os campos devem utilizar dropdowns quando aplicável.

Não utilizar campos de texto livre para programas, pessoas ou ilhas.

Modalidade de Trabalho

Disponibilizar:

Presencial (TV)

Home Office

Status da Escala

Disponibilizar inicialmente:

Trabalhando

Folga

Folga Semanal

O status deve aparecer visualmente na grade.

Filtros

Adicionar filtros acima da escala:

Pessoa

Função

Programa

Ilha

Modalidade

Status

Período

Pesquisa

Adicionar busca rápida por:

Nome do colaborador

Programa

Ilha

Experiência do Usuário

Inspirar-se em:

Airtable

Monday.com

ClickUp

Características obrigatórias:

Interface moderna

Visual limpo

Navegação rápida

Poucos cliques

Excelente visualização em telas grandes

Scroll horizontal fluido para navegação temporal

Coluna de colaboradores sempre visível

Importante

Nesta primeira versão NÃO implementar:

Controle de ponto

Banco de horas

Gestão de férias

Aprovações

Relatórios

Dashboard executivo

Notificações

Aplicativo mobile

Integrações externas

Construir apenas uma base sólida e escalável para futuras evoluções.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://escalapos.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9a44168a-4d9d-43bf-8267-3b9d68c71a64).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
