import os
import sys
import html
import matplotlib.pyplot as plt
import numpy as np

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, PageBreak, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

# ==============================================================================
# 1. GERAÇÃO DOS GRÁFICOS (MATPLOTLIB)
# ==============================================================================
os.makedirs("docs/security-audit/assets", exist_ok=True)
donut_chart_path = "docs/security-audit/assets/donut_severities.png"
bar_chart_path = "docs/security-audit/assets/bar_categories.png"

# Gráfico 1: Rosca de Severidades
plt.figure(figsize=(4.2, 3.0), dpi=220)
severities = ['Crítica', 'Alta', 'Média', 'Baixa']
counts = [2, 1, 2, 2]
colors_list = ['#B91C1C', '#EA580C', '#D97706', '#2563EB']

wedges, texts, autotexts = plt.pie(
    counts, labels=severities, autopct='%1.0f%%', startangle=140,
    colors=colors_list, pctdistance=0.75,
    textprops=dict(color="#1F2937", fontsize=9, weight='bold'),
    wedgeprops=dict(width=0.45, edgecolor='#FFFFFF', linewidth=2)
)
for at in autotexts:
    at.set_color('white')
    at.set_fontsize(9)
    at.set_weight('bold')

plt.title("Distribuição por Severidade", fontsize=10.5, fontweight='bold', color='#111827', pad=8)
plt.tight_layout()
plt.savefig(donut_chart_path, transparent=True)
plt.close()

# Gráfico 2: Barras por Categoria
plt.figure(figsize=(5.2, 3.0), dpi=220)
categories = [
    '1. Banco / RLS',
    '2. Permissões / Cron',
    '3. IDOR',
    '4. Chaves Expostas',
    '5. XSS / Injeção'
]
cat_counts = [1, 1, 1, 2, 2]
bar_colors = ['#B91C1C', '#EA580C', '#D97706', '#B91C1C', '#D97706']

y_pos = np.arange(len(categories))
bars = plt.barh(y_pos, cat_counts, color=bar_colors, height=0.52, edgecolor='#E5E7EB', linewidth=1)

for bar in bars:
    w = bar.get_width()
    plt.text(w + 0.08, bar.get_y() + bar.get_height()/2, f'{int(w)}',
             ha='left', va='center', fontsize=9, fontweight='bold', color='#111827')

plt.yticks(y_pos, categories, fontsize=8.5, fontweight='bold', color='#374151')
plt.xlim(0, 3)
plt.xlabel("Total de Achados", fontsize=8.5, fontweight='bold', color='#4B5563')
plt.title("Achados por Categoria Auditada", fontsize=10.5, fontweight='bold', color='#111827', pad=8)
plt.gca().invert_yaxis()
plt.gca().spines['top'].set_visible(False)
plt.gca().spines['right'].set_visible(False)
plt.gca().spines['left'].set_color('#9CA3AF')
plt.gca().spines['bottom'].set_color('#9CA3AF')
plt.tight_layout()
plt.savefig(bar_chart_path, transparent=True)
plt.close()

# ==============================================================================
# 2. CONFIGURAÇÃO DO CANVAS NUMERADO COM HEADER E FOOTER
# ==============================================================================
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            return  # Capa limpa

        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#6B7280"))

        # Cabeçalho
        self.drawString(1.8 * cm, 28.3 * cm, "Relatório de Auditoria de Segurança — FutStats (futebol-analise)")
        self.setStrokeColor(colors.HexColor("#E5E7EB"))
        self.setLineWidth(0.5)
        self.line(1.8 * cm, 28.1 * cm, 19.2 * cm, 28.1 * cm)

        # Rodapé
        self.line(1.8 * cm, 1.8 * cm, 19.2 * cm, 1.8 * cm)
        self.drawString(1.8 * cm, 1.4 * cm, "Confidencial · Auditoria de Segurança de Código-Fonte")
        page_str = f"Página {self._pageNumber} de {page_count}"
        self.drawRightString(19.2 * cm, 1.4 * cm, page_str)
        self.restoreState()

# ==============================================================================
# 3. CONSTRUÇÃO DO DOCUMENTO REPORTLAB
# ==============================================================================
pdf_path = "docs/security-audit/relatorio-auditoria-seguranca.pdf"
doc = SimpleDocTemplate(
    pdf_path,
    pagesize=A4,
    leftMargin=1.8 * cm,
    rightMargin=1.8 * cm,
    topMargin=2.0 * cm,
    bottomMargin=2.2 * cm
)

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'CoverTitle',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=20,
    leading=24,
    textColor=colors.HexColor("#0F172A"),
    alignment=0
)
subtitle_style = ParagraphStyle(
    'CoverSubtitle',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=11,
    leading=15,
    textColor=colors.HexColor("#475569"),
    alignment=0
)
h1_style = ParagraphStyle(
    'Heading1_Custom',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=12,
    leading=16,
    textColor=colors.HexColor("#0F172A"),
    spaceBefore=10,
    spaceAfter=4
)
body_style = ParagraphStyle(
    'Body_Custom',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=8.2,
    leading=11.6,
    textColor=colors.HexColor("#334155")
)
table_cell_style = ParagraphStyle(
    'TableCell',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=7.5,
    leading=10.0,
    textColor=colors.HexColor("#1E293B")
)
table_header_style = ParagraphStyle(
    'TableHeader',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=7.8,
    leading=10.5,
    textColor=colors.white
)

elements = []

# ==============================================================================
# PÁGINA 1: CAPA E NOTA METODOLÓGICA
# ==============================================================================
elements.append(Spacer(1, 0.6 * cm))
elements.append(Paragraph("Relatório de Auditoria de Segurança", title_style))
elements.append(Spacer(1, 0.15 * cm))
elements.append(Paragraph("Projeto: <b>FutStats</b> (<font name='Courier'>futebol-analise</font>)", subtitle_style))
elements.append(Spacer(1, 0.3 * cm))
elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#0EA5E9"), spaceAfter=12))

meta_data = [
    [Paragraph("<b>Data da Auditoria:</b> 01 de Setembro de 2026", body_style), Paragraph("<b>Tipo de Auditoria:</b> White-box Source Code Review", body_style)],
    [Paragraph("<b>Escopo Auditado:</b> Repositório Completo (Frontend, API Serverless, Supabase, Configs)", body_style), Paragraph("<b>Classificação:</b> Restrito / Confidencial", body_style)],
]
meta_table = Table(meta_data, colWidths=[8.7 * cm, 8.7 * cm])
meta_table.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
    ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#E2E8F0")),
    ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
    ('TOPPADDING', (0,0), (-1,-1), 5),
    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('LEFTPADDING', (0,0), (-1,-1), 8),
    ('RIGHTPADDING', (0,0), (-1,-1), 8),
]))
elements.append(meta_table)
elements.append(Spacer(1, 0.35 * cm))

elements.append(Paragraph("1. Detecção da Stack & Nota Metodológica", h1_style))
elements.append(Paragraph(
    "Antes do início dos testes, a arquitetura e stack técnica do projeto foram integralmente mapeadas "
    "para contextualizar a análise de vulnerabilidades nas 5 categorias requeridas:",
    body_style
))
elements.append(Spacer(1, 0.15 * cm))

stack_info = [
    [Paragraph("<b>Camada</b>", table_header_style), Paragraph("<b>Tecnologias Identificadas</b>", table_header_style), Paragraph("<b>Mapeamento Metodológico da Auditoria</b>", table_header_style)],
    [
        Paragraph("<b>Frontend</b>", table_cell_style),
        Paragraph("Vanilla JavaScript (ES6+ SPA), Hash Routing (<font name='Courier'>#/</font>), PWA (<font name='Courier'>sw.js</font>), WebPush API.", table_cell_style),
        Paragraph("Inspeção de XSS via <font name='Courier'>innerHTML</font>, URLs <font name='Courier'>javascript:</font>, vazamento de chaves e controle de estado local.", table_cell_style)
    ],
    [
        Paragraph("<b>Backend</b>", table_cell_style),
        Paragraph("Node.js Serverless Functions na Vercel (<font name='Courier'>api/football.js</font>, <font name='Courier'>api/news.js</font>, <font name='Courier'>api/img.js</font>, <font name='Courier'>api/cron-alerts.js</font>).", table_cell_style),
        Paragraph("Verificação de controle de acesso em endpoints cron, proxies de API externa, SSRF, injeção de comandos e gestão de segredos.", table_cell_style)
    ],
    [
        Paragraph("<b>Edge / BaaS</b>", table_cell_style),
        Paragraph("Supabase PostgreSQL (PostgREST / <font name='Courier'>@supabase/supabase-js</font>), Supabase Edge Functions (Deno).", table_cell_style),
        Paragraph("Auditoria de Row Level Security (RLS) na tabela <font name='Courier'>push_subscriptions</font> e uso da chave anônima/serviço.", table_cell_style)
    ],
    [
        Paragraph("<b>Auth & Tenant</b>", table_cell_style),
        Paragraph("Aplicação aberta (sem login/sessão de usuário). Isolamento de preferências via <font name='Courier'>localStorage</font> e push por endpoint.", table_cell_style),
        Paragraph("Mapeamento de IDOR e isolamento de dados no cliente e na persistência remota do Supabase.", table_cell_style)
    ],
    [
        Paragraph("<b>Deploy / CI</b>", table_cell_style),
        Paragraph("Vercel Git Integration, <font name='Courier'>.env.local</font> (ignorado no git), sem Docker/Helm/Terraform.", table_cell_style),
        Paragraph("Verificação de segredos commitados, defaults em código e arquivos de backup (<font name='Courier'>backups/</font>).", table_cell_style)
    ]
]
stack_table = Table(stack_info, colWidths=[2.6 * cm, 6.4 * cm, 8.4 * cm])
stack_table.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
    ('ALIGN', (0,0), (-1,-1), 'LEFT'),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
    ('TOPPADDING', (0,0), (-1,-1), 4),
    ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ('LEFTPADDING', (0,0), (-1,-1), 6),
    ('RIGHTPADDING', (0,0), (-1,-1), 6),
]))
elements.append(stack_table)

elements.append(PageBreak())

# ==============================================================================
# PÁGINA 2: RESUMO EXECUTIVO E GRÁFICOS
# ==============================================================================
elements.append(Paragraph("2. Resumo Executivo", h1_style))
elements.append(Paragraph(
    "A auditoria identificou um total de <b>7 achados verificados</b> distribuídos em diferentes níveis de criticidade. "
    "Os pontos mais urgentes residem na <b>exposição da Chave Privada VAPID e chave da API-Football como fallbacks em código-fonte</b> "
    "e na <b>ausência de Row Level Security (RLS) restritivo na tabela do Supabase</b>, permitindo que qualquer cliente consulte ou apague "
    "as inscrições push de todos os usuários.",
    body_style
))
elements.append(Spacer(1, 0.25 * cm))

summary_cards = [
    [
        Paragraph("<font color='#B91C1C'><b>CRÍTICA (2)</b></font><br/>VAPID Key & RLS Ausente", table_cell_style),
        Paragraph("<font color='#EA580C'><b>ALTA (1)</b></font><br/>Cron Endpoint Aberto", table_cell_style),
        Paragraph("<font color='#D97706'><b>MÉDIA (2)</b></font><br/>IDOR Push & XSS News", table_cell_style),
        Paragraph("<font color='#2563EB'><b>BAIXA (2)</b></font><br/>Backups & Backend Unescape", table_cell_style),
        Paragraph("<font color='#059669'><b>PONTOS FORTES (5)</b></font><br/>Whitelists & Local Escapes", table_cell_style)
    ]
]
sum_table = Table(summary_cards, colWidths=[3.48 * cm, 3.48 * cm, 3.48 * cm, 3.48 * cm, 3.48 * cm])
sum_table.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (0,0), colors.HexColor("#FEE2E2")),
    ('BACKGROUND', (1,0), (1,0), colors.HexColor("#FFEDD5")),
    ('BACKGROUND', (2,0), (2,0), colors.HexColor("#FEF3C7")),
    ('BACKGROUND', (3,0), (3,0), colors.HexColor("#DBEAFE")),
    ('BACKGROUND', (4,0), (4,0), colors.HexColor("#D1FAE5")),
    ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
    ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
    ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('TOPPADDING', (0,0), (-1,-1), 4),
    ('BOTTOMPADDING', (0,0), (-1,-1), 4),
]))
elements.append(sum_table)
elements.append(Spacer(1, 0.25 * cm))

chart_table_data = [
    [Image(donut_chart_path, width=7.8 * cm, height=5.3 * cm), Image(bar_chart_path, width=9.2 * cm, height=5.3 * cm)]
]
chart_table = Table(chart_table_data, colWidths=[8.5 * cm, 9.5 * cm])
chart_table.setStyle(TableStyle([
    ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('LEFTPADDING', (0,0), (-1,-1), 0),
    ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ('TOPPADDING', (0,0), (-1,-1), 0),
    ('BOTTOMPADDING', (0,0), (-1,-1), 0),
]))
elements.append(chart_table)
elements.append(Spacer(1, 0.25 * cm))

elements.append(Paragraph("3. Pontos Fortes e Riscos Centrais", h1_style))
p_fortes = [
    [Paragraph("<b>Pontos Fortes (Controles Verificados e Corretos)</b>", table_header_style), Paragraph("<b>Pontos Fracos (Riscos Centrais)</b>", table_header_style)],
    [
        Paragraph(
            "• <b>Whitelist de Endpoints no Proxy:</b> <font name='Courier'>api/football.js:6-27</font> restringe endpoints da API externa via <font name='Courier'>ALLOWED_ENDPOINTS</font> Set, bloqueando SSRF e chamadas arbitrárias.<br/>"
            "• <b>Validação de Host de Imagens:</b> <font name='Courier'>api/img.js:8-11</font> rejeita URLs fora de <font name='Courier'>https://media.api-sports.io/</font>, mitigando Open Proxy.<br/>"
            "• <b>Função de Escape HTML:</b> <font name='Courier'>public/app.js:87-94</font> implementa <font name='Courier'>escapeHtml</font> para sanitização de strings em múltiplos templates.<br/>"
            "• <b>Isolamento de Escalações no Cliente:</b> O montador de escalações opera estritamente no <font name='Courier'>localStorage</font>, sem tráfego de dados sensíveis na nuvem.<br/>"
            "• <b>Proteção Git:</b> O arquivo <font name='Courier'>.gitignore</font> isola corretamente <font name='Courier'>.env</font> e <font name='Courier'>.env.local</font>.",
            table_cell_style
        ),
        Paragraph(
            "• <b>Chaves de Produção no Código:</b> Chave privada VAPID e chave da API-Football expostas como fallbacks literais em <font name='Courier'>api/cron-alerts.js</font>.<br/>"
            "• <b>Tabela Push sem RLS:</b> <font name='Courier'>push_subscriptions</font> no Supabase permite dump ou exclusão anônima de todas as inscrições push cadastradas.<br/>"
            "• <b>Disparador de Cron sem Autenticação:</b> <font name='Courier'>api/cron-alerts.js</font> pode ser acionado livremente por qualquer agente externo, esgotando quota da API e gerando custos.<br/>"
            "• <b>XSS via Feed de Notícias:</b> Títulos e links RSS de terceiros inseridos sem escape em <font name='Courier'>loadTeamNews</font>.",
            table_cell_style
        )
    ]
]
t_fortes = Table(p_fortes, colWidths=[8.7 * cm, 8.7 * cm])
t_fortes.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (0,0), colors.HexColor("#059669")),
    ('BACKGROUND', (1,0), (1,0), colors.HexColor("#DC2626")),
    ('ALIGN', (0,0), (-1,-1), 'LEFT'),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor("#F8FAFC")]),
    ('TOPPADDING', (0,0), (-1,-1), 5),
    ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('LEFTPADDING', (0,0), (-1,-1), 6),
    ('RIGHTPADDING', (0,0), (-1,-1), 6),
]))
elements.append(t_fortes)

elements.append(PageBreak())

# ==============================================================================
# PÁGINA 3: TABELA DETALHADA DE ACHADOS POR CATEGORIA
# ==============================================================================
elements.append(Paragraph("4. Tabela de Achados Detalhados por Categoria", h1_style))
elements.append(Paragraph(
    "Abaixo estão listados todos os achados comprovados no código real, com sua localização precisa e mecanismo de risco:",
    body_style
))
elements.append(Spacer(1, 0.2 * cm))

findings_data = [
    [
        Paragraph("<b>Sev.</b>", table_header_style),
        Paragraph("<b>Categoria</b>", table_header_style),
        Paragraph("<b>Arquivo : Linha</b>", table_header_style),
        Paragraph("<b>Descrição da Falha & Evidência</b>", table_header_style)
    ],
    [
        Paragraph("<font color='#B91C1C'><b>CRÍTICA</b></font>", table_cell_style),
        Paragraph("1. Banco / RLS", table_cell_style),
        Paragraph("<font name='Courier' size='6.8'>public/app.js:80-81, 674-683<br/>api/cron-alerts.js:9-10, 23-25</font>", table_cell_style),
        Paragraph("<b>Tabela push_subscriptions sem RLS restritivo:</b> O backend usa SUPABASE_ANON_KEY para select('*'). Como a anon key é pública no frontend, qualquer atacante pode ler ou deletar em massa todos os tokens push de todos os usuários via API PostgREST.", table_cell_style)
    ],
    [
        Paragraph("<font color='#EA580C'><b>ALTA</b></font>", table_cell_style),
        Paragraph("2. Permissões / Cron", table_cell_style),
        Paragraph("<font name='Courier' size='6.8'>api/cron-alerts.js:20-320</font>", table_cell_style),
        Paragraph("<b>Endpoint Cron de Disparo Push sem Autenticação:</b> A rota serverless não valida token secreto de cron (CRON_SECRET) nem header do Vercel Cron. Qualquer usuário pode fazer requisições ilimitadas, disparando push em massa e consumindo quota da API-Football.", table_cell_style)
    ],
    [
        Paragraph("<font color='#D97706'><b>MÉDIA</b></font>", table_cell_style),
        Paragraph("3. IDOR", table_cell_style),
        Paragraph("<font name='Courier' size='6.8'>public/app.js:674-683<br/>api/cron-alerts.js:69, 297-300</font>", table_cell_style),
        Paragraph("<b>Manipulação e Sobrescrita de Assinaturas Push por Endpoint:</b> A tabela PostgREST aceita operações de merge/update baseadas apenas no parâmetro endpoint sem validação de posse do cliente ou assinatura de sessão.", table_cell_style)
    ],
    [
        Paragraph("<font color='#B91C1C'><b>CRÍTICA</b></font>", table_cell_style),
        Paragraph("4. Chaves Expostas", table_cell_style),
        Paragraph("<font name='Courier' size='6.8'>api/cron-alerts.js:8, 10, 13</font>", table_cell_style),
        Paragraph("<b>Chave Privada VAPID e API Key Hardcoded como Fallbacks:</b> Segredo criptográfico privado VAPID (gWKwUrc5XB...) e chave da API-Sports embutidos em código-fonte via operador ||. Permite falsificação de WebPush e roubo de quota.", table_cell_style)
    ],
    [
        Paragraph("<font color='#2563EB'><b>BAIXA</b></font>", table_cell_style),
        Paragraph("4. Chaves Expostas", table_cell_style),
        Paragraph("<font name='Courier' size='6.8'>backups/snapshot_stable/api/cron-alerts.js:8-13</font>", table_cell_style),
        Paragraph("<b>Credenciais Replicadas em Diretório de Backup:</b> Os arquivos estáticos e compactados de snapshot contêm as mesmas chaves confidenciais expostas.", table_cell_style)
    ],
    [
        Paragraph("<font color='#D97706'><b>MÉDIA</b></font>", table_cell_style),
        Paragraph("5. XSS / Injeção", table_cell_style),
        Paragraph("<font name='Courier' size='6.8'>public/app.js:1275-1288</font>", table_cell_style),
        Paragraph("<b>Injeção Direta de Título, Fonte e Link RSS em innerHTML:</b> Dados externos retornados por feeds de notícias são renderizados sem passar por escapeHtml() e links não validam protocolo seguro.", table_cell_style)
    ],
    [
        Paragraph("<font color='#2563EB'><b>BAIXA</b></font>", table_cell_style),
        Paragraph("5. XSS / Injeção", table_cell_style),
        Paragraph("<font name='Courier' size='6.8'>api/news.js:203-209</font>", table_cell_style),
        Paragraph("<b>Dessanitização de Entidades HTML no Backend:</b> O parser de RSS converte &amp;lt; e &amp;gt; em caracteres literais &lt; e &gt;, agravando o risco de XSS caso o frontend renderize em innerHTML.", table_cell_style)
    ]
]

findings_table = Table(findings_data, colWidths=[2.0 * cm, 3.2 * cm, 4.4 * cm, 7.8 * cm])
findings_table.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
    ('ALIGN', (0,0), (-1,-1), 'LEFT'),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
    ('TOPPADDING', (0,0), (-1,-1), 4),
    ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ('LEFTPADDING', (0,0), (-1,-1), 5),
    ('RIGHTPADDING', (0,0), (-1,-1), 5),
]))
elements.append(findings_table)
elements.append(Spacer(1, 0.25 * cm))

elements.append(Paragraph("5. Recomendações Priorizadas de Correção", h1_style))
recs = [
    Paragraph("<b>P1 (Imediato / Blocker):</b> Remover todos os fallbacks literais de segredos em <font name='Courier'>api/cron-alerts.js</font>, rotacionar a chave da API-Football e o par de chaves VAPID no provedor, e configurar as variáveis no painel da Vercel.", body_style),
    Paragraph("<b>P1 (Imediato / Blocker):</b> Habilitar Row Level Security (RLS) na tabela <font name='Courier'>push_subscriptions</font> do Supabase. Utilizar a chave de serviço (<font name='Courier'>SUPABASE_SERVICE_ROLE_KEY</font>) exclusivamente no backend e restringir a anon key apenas a inserções anônimas sem permissão de SELECT geral.", body_style),
    Paragraph("<b>P2 (Alta Prioridade):</b> Adicionar autenticação por bearer token em <font name='Courier'>api/cron-alerts.js</font> (<font name='Courier'>process.env.CRON_SECRET</font>) para impedir acionamento externo indiscriminado.", body_style),
    Paragraph("<b>P2 (Alta Prioridade):</b> Aplicar <font name='Courier'>escapeHtml()</font> e validação de URL em <font name='Courier'>loadTeamNews</font> em <font name='Courier'>public/app.js</font>.", body_style),
    Paragraph("<b>P3 (Média Prioridade):</b> Limpar os backups estáticos em <font name='Courier'>backups/</font> e adicionar script de validação de startup para abortar execução se variáveis críticas estiverem ausentes.", body_style)
]
for r in recs:
    elements.append(r)
    elements.append(Spacer(1, 0.1 * cm))

elements.append(PageBreak())

# ==============================================================================
# PÁGINA 4: SEÇÃO DE ISSUES PARA O GITHUB (MARKDOWN COMPLETO)
# ==============================================================================
elements.append(Paragraph("6. Issues para o GitHub (Prontas para Cópia)", h1_style))
elements.append(Paragraph(
    "Os blocos abaixo contêm o texto Markdown completo, estruturado e pronto para criar as issues no GitHub do projeto:",
    body_style
))
elements.append(Spacer(1, 0.25 * cm))

issues = [
    {
        "num": 1,
        "title": "[Segurança] Exposição de Chave Privada VAPID e API Key em fallback de código",
        "labels": "security, severidade:crítica, backend",
        "desc": [
            ("### Descrição do Problema", "h3"),
            ("O arquivo api/cron-alerts.js define credenciais confidenciais de produção como valores de fallback do operador || caso as variáveis de ambiente não estejam populadas. Entre os valores expostos estão a chave privada de assinatura VAPID (gWKwUrc5XB...) e a chave de acesso da API-Sports (a70fc65a67...).", "p"),
            ("### Evidência de Código", "h3"),
            ("Arquivo: api/cron-alerts.js:8-13", "p"),
            ("const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || \"a70fc65a67c10981ace9813a509db554\";\nconst VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || \"gWKwUrc5XBpYUOBExM1ha_M3ugoo5JbM7mQSMt4Lk_c\";", "code"),
            ("### Impacto", "h3"),
            ("Permite a emissão não autorizada de notificações WebPush arbitrárias para dispositivos de usuários inscritos e o consumo/esgotamento da cota de requisições da API de futebol.", "p"),
            ("### Sugestão de Correção", "h3"),
            ("1. Remover imediatamente as strings de fallback do código-fonte.", "list"),
            ("2. Exigir que a função aborte com erro 500 caso as variáveis não existam no process.env.", "list"),
            ("3. Rotacionar as chaves VAPID e a chave da API-Sports no provedor.", "list"),
            ("### Critérios de Aceite", "h3"),
            ("- [ ] Nenhum segredo ou chave privada presente como literal no código-fonte.", "check"),
            ("- [ ] Inicialização aborta com erro explícito se process.env.VAPID_PRIVATE_KEY for nula.", "check"),
            ("- [ ] Par de chaves VAPID e API Key rotacionados em produção.", "check")
        ]
    },
    {
        "num": 2,
        "title": "[Segurança] Tabela push_subscriptions exposta sem Row Level Security (RLS) restritivo",
        "labels": "security, severidade:crítica, database, supabase",
        "desc": [
            ("### Descrição do Problema", "h3"),
            ("A tabela push_subscriptions no Supabase está acessível para a role anon. Como o backend em api/cron-alerts.js usa a chave anônima para ler todos os registros (select('*')), a tabela não possui RLS restritivo de leitura. Qualquer usuário de posse da SUPABASE_ANON_KEY pública do frontend pode consultar todos os endpoints e preferências ou executar DELETE em massa.", "p"),
            ("### Evidência de Código", "h3"),
            ("Arquivo: public/app.js:80-81, 674-683 e api/cron-alerts.js:9-10, 23-25", "p"),
            ("const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || \"eyJhbGciOiJIUzI1NiIsInR5cCI6...\";\nconst { data: subscribers } = await supabase.from(\"push_subscriptions\").select(\"*\");", "code"),
            ("### Impacto", "h3"),
            ("Vazamento total da base de inscritos (endpoints WebPush, chaves criptográficas p256dh/auth e times favoritos) e potencial destruição de dados por deleção não autenticada.", "p"),
            ("### Sugestão de Correção", "h3"),
            ("1. Ativar Row Level Security (ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;).", "list"),
            ("2. Criar política permitindo apenas INSERT para a role anon.", "list"),
            ("3. Utilizar a SUPABASE_SERVICE_ROLE_KEY exclusivamente no backend api/cron-alerts.js para leitura e manutenção global.", "list"),
            ("### Critérios de Aceite", "h3"),
            ("- [ ] RLS ativado na tabela push_subscriptions.", "check"),
            ("- [ ] Requisição GET /rest/v1/push_subscriptions com anon key retorna lista vazia ou erro 401/403.", "check"),
            ("- [ ] Backend utiliza chave de serviço segura para leitura de inscritos.", "check")
        ]
    },
    {
        "num": 3,
        "title": "[Segurança] Endpoint cron-alerts desprotegido contra execução não autorizada",
        "labels": "security, severidade:alta, backend, api",
        "desc": [
            ("### Descrição do Problema", "h3"),
            ("O endpoint serverless /api/cron-alerts executa a checagem de partidas e disparo de notificações push sem verificar qualquer mecanismo de autenticação ou token de segurança.", "p"),
            ("### Evidência de Código", "h3"),
            ("Arquivo: api/cron-alerts.js:20-30", "p"),
            ("module.exports = async (req, res) => {\n  // Nenhuma verificação de req.headers.authorization ou CRON_SECRET\n  const { data: subscribers, error: subError } = await supabase...", "code"),
            ("### Impacto", "h3"),
            ("Ataque de negação de serviço (DoS), esgotamento rápido de requisições contratadas na API-Football e envio repetitivo/spam de notificações aos usuários.", "p"),
            ("### Sugestão de Correção", "h3"),
            ("1. Implementar checagem de autorização via header Authorization: Bearer ${process.env.CRON_SECRET} ou validar o header x-vercel-cron da Vercel.", "list"),
            ("### Critérios de Aceite", "h3"),
            ("- [ ] Chamadas HTTP sem o secret retornam 401 Unauthorized.", "check"),
            ("- [ ] Vercel Cron configurado para enviar o token de autorização.", "check")
        ]
    },
    {
        "num": 4,
        "title": "[Segurança] Injeção de dados de notícias RSS em innerHTML sem escape (XSS)",
        "labels": "security, severidade:média, frontend, xss",
        "desc": [
            ("### Descrição do Problema", "h3"),
            ("A função loadTeamNews em public/app.js interpola os campos item.title, item.source e item.link de feeds RSS externos diretamente no innerHTML do container de notícias sem sanitização.", "p"),
            ("### Evidência de Código", "h3"),
            ("Arquivo: public/app.js:1275-1288", "p"),
            ("container.innerHTML = `\n  <div class=\"news-list-compact\">\n    ${newsItems.map(item => `\n      <a class=\"news-card-compact\" href=\"${item.link}\" target=\"_blank\" rel=\"noopener noreferrer\">\n        <h4 class=\"news-card-title\">${item.title}</h4>", "code"),
            ("### Impacto", "h3"),
            ("Execução de scripts arbitrários (XSS) no contexto do navegador caso um feed RSS externo ou provedor de notícias contenha payload malicioso no título ou link.", "p"),
            ("### Sugestão de Correção", "h3"),
            ("1. Envolver item.title e item.source na função escapeHtml().", "list"),
            ("2. Validar que item.link inicia estritamente com http:// ou https:// antes de renderizar no href.", "list"),
            ("### Critérios de Aceite", "h3"),
            ("- [ ] Tags HTML em títulos de notícias são renderizadas como texto plano escapado.", "check"),
            ("- [ ] Links com esquema javascript: são rejeitados.", "check")
        ]
    }
]

for iss in issues:
    issue_content = []
    issue_content.append(Paragraph(f"<b>--- ISSUE {iss['num']} ---</b>", ParagraphStyle('IssueDelim', fontName='Helvetica-Bold', fontSize=8.0, textColor=colors.HexColor("#0EA5E9"))))
    issue_content.append(Paragraph(f"<b>Título:</b> {html.escape(iss['title'])}", ParagraphStyle('IssueTitle', fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.HexColor("#0F172A"))))
    issue_content.append(Paragraph(f"<b>Labels:</b> <font name='Courier' size='7'>{html.escape(iss['labels'])}</font>", ParagraphStyle('IssueLabels', fontName='Helvetica', fontSize=7.6, textColor=colors.HexColor("#64748B"))))
    issue_content.append(Spacer(1, 0.08 * cm))
    
    for item, itype in iss['desc']:
        if itype == "h3":
            issue_content.append(Paragraph(f"<b>{html.escape(item[4:])}</b>", ParagraphStyle('IH3', fontName='Helvetica-Bold', fontSize=7.6, textColor=colors.HexColor("#1E293B"))))
        elif itype == "check":
            issue_content.append(Paragraph(f"• {html.escape(item[5:].strip())}", ParagraphStyle('ICheck', fontName='Helvetica', fontSize=7.0, textColor=colors.HexColor("#334155"), leftIndent=8)))
        elif itype == "list":
            issue_content.append(Paragraph(html.escape(item), ParagraphStyle('INum', fontName='Helvetica', fontSize=7.0, textColor=colors.HexColor("#334155"), leftIndent=8)))
        elif itype == "code":
            clean_code = html.escape(item).replace('\n', '<br/>')
            issue_content.append(Paragraph(f"<font name='Courier' size='6.5'>{clean_code}</font>", ParagraphStyle('ICode', fontName='Courier', fontSize=6.5, leading=8.0, textColor=colors.HexColor("#0F172A"), leftIndent=8)))
        else:
            issue_content.append(Paragraph(html.escape(item), ParagraphStyle('ITxt', fontName='Helvetica', fontSize=7.0, textColor=colors.HexColor("#334155"))))

    issue_content.append(Spacer(1, 0.06 * cm))
    issue_content.append(Paragraph(f"<b>--- FIM ISSUE {iss['num']} ---</b>", ParagraphStyle('IssueDelimEnd', fontName='Helvetica-Bold', fontSize=8.0, textColor=colors.HexColor("#0EA5E9"))))
    
    issue_box = Table([[issue_content]], colWidths=[17.4 * cm])
    issue_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    
    elements.append(KeepTogether(issue_box))
    elements.append(Spacer(1, 0.2 * cm))

# Construção do PDF
doc.build(elements, canvasmaker=NumberedCanvas)
print("PDF gerado com sucesso em:", pdf_path)
