# docs/security-audit/generate_report.py
# -*- coding: utf-8 -*-
"""
Gerador de Relatório de Auditoria de Segurança - FutStats
Gera documento PDF formatado em padrão profissional com gráficos executivos,
tabelas de achados detalhados, pontos fortes e issues prontas para o GitHub.
"""

import os
import sys
import html
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, PageBreak, HRFlowable
)
from reportlab.pdfgen import canvas

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_PATH = os.path.join(BASE_DIR, "relatorio-auditoria-seguranca.pdf")
IMG_DIR = os.path.join(BASE_DIR, "charts")
os.makedirs(IMG_DIR, exist_ok=True)

DONUT_CHART_PATH = os.path.join(IMG_DIR, "donut_severidade.png")
BAR_CHART_PATH = os.path.join(IMG_DIR, "bar_categorias.png")

# Paleta oficial
COLOR_CRITICA = "#B91C1C"
COLOR_ALTA = "#EA580C"
COLOR_MEDIA = "#D97706"
COLOR_BAIXA = "#2563EB"
COLOR_FORTE = "#059669"
COLOR_TEXT = "#1E293B"
COLOR_BG_LIGHT = "#F8FAFC"
COLOR_LINE = "#CBD5E1"


def generate_charts():
    # 1. Gráfico de Rosca - Severidade
    labels = ['Crítica (3)', 'Alta (4)', 'Média (2)']
    sizes = [3, 4, 2]
    chart_colors = [COLOR_CRITICA, COLOR_ALTA, COLOR_MEDIA]

    fig, ax = plt.subplots(figsize=(4.2, 3.2), subplot_kw=dict(aspect="equal"))
    wedges, texts, autotexts = ax.pie(
        sizes,
        labels=labels,
        autopct='%1.0f%%',
        startangle=140,
        colors=chart_colors,
        pctdistance=0.75,
        wedgeprops=dict(width=0.45, edgecolor='white', linewidth=2),
        textprops=dict(color=COLOR_TEXT, fontsize=9, weight='bold')
    )
    for at in autotexts:
        at.set_color('white')
        at.set_fontsize(10)
        at.set_weight('bold')

    ax.set_title("Achados por Severidade\n(Total: 9 vulnerabilidades)", fontsize=11, weight='bold', color=COLOR_TEXT, pad=12)
    plt.tight_layout()
    plt.savefig(DONUT_CHART_PATH, dpi=200, transparent=True)
    plt.close()

    # 2. Gráfico de Barras - Categorias
    categories = [
        '1. Banco sem\nTranca (RLS)',
        '2. Permissão\nNavegador',
        '3. IDOR em\nHandlers',
        '4. Chaves\nExpostas',
        '5. Inputs sem\nTratamento'
    ]
    counts = [1, 1, 1, 4, 2]
    bar_colors = [COLOR_CRITICA, COLOR_ALTA, COLOR_ALTA, COLOR_CRITICA, COLOR_ALTA]

    fig, ax = plt.subplots(figsize=(5.4, 3.2))
    bars = ax.bar(categories, counts, color=bar_colors, width=0.55, edgecolor='white', linewidth=1.5)

    for bar in bars:
        yval = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2.0, yval + 0.12, int(yval), ha='center', va='bottom', fontsize=9, weight='bold', color=COLOR_TEXT)

    ax.set_ylim(0, 5)
    ax.set_ylabel("Quantidade de Achados", fontsize=9, color=COLOR_TEXT, weight='bold')
    ax.set_title("Vulnerabilidades por Categoria Auditada", fontsize=11, weight='bold', color=COLOR_TEXT, pad=12)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color(COLOR_LINE)
    ax.spines['bottom'].set_color(COLOR_LINE)
    ax.yaxis.grid(True, linestyle='--', alpha=0.5, color=COLOR_LINE)
    ax.set_axisbelow(True)
    plt.xticks(fontsize=8, color=COLOR_TEXT, weight='bold')
    plt.yticks(range(0, 6), fontsize=8, color=COLOR_TEXT)
    plt.tight_layout()
    plt.savefig(BAR_CHART_PATH, dpi=200, transparent=True)
    plt.close()
    print("Gráficos gerados com sucesso!")


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
            self.draw_header_footer(num_pages)
            super().showPage()
        super().save()

    def draw_header_footer(self, page_count):
        self.saveState()
        if self._pageNumber > 1:
            # Header
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(colors.HexColor("#64748B"))
            self.drawString(2 * cm, 28.3 * cm, "RELATÓRIO DE AUDITORIA DE SEGURANÇA — FUTSTATS")
            self.setFont("Helvetica", 8)
            self.drawRightString(19 * cm, 28.3 * cm, "CONFIDENCIAL")
            self.setStrokeColor(colors.HexColor("#E2E8F0"))
            self.setLineWidth(0.75)
            self.line(2 * cm, 28.1 * cm, 19 * cm, 28.1 * cm)

            # Footer
            self.line(2 * cm, 1.8 * cm, 19 * cm, 1.8 * cm)
            self.setFont("Helvetica", 8)
            self.drawString(2 * cm, 1.3 * cm, "Auditoria Estática e Arquitetural de Código-Fonte")
            page_text = f"Página {self._pageNumber} de {page_count}"
            self.drawRightString(19 * cm, 1.3 * cm, page_text)
        self.restoreState()


def build_pdf():
    doc = SimpleDocTemplate(
        PDF_PATH,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2.2 * cm,
        bottomMargin=2.2 * cm
    )

    styles = getSampleStyleSheet()
    
    style_cover_title = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=30,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=10
    )
    style_cover_sub = ParagraphStyle(
        'CoverSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#475569"),
        spaceAfter=25
    )
    style_meta = ParagraphStyle(
        'CoverMeta',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=14,
        textColor=colors.HexColor("#334155")
    )
    style_h1 = ParagraphStyle(
        'SectionH1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=16,
        spaceAfter=8,
        keepWithNext=True
    )
    style_h2 = ParagraphStyle(
        'SectionH2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#1E293B"),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )
    style_body = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12.5,
        textColor=colors.HexColor("#1E293B"),
        spaceAfter=5
    )
    style_body_bold = ParagraphStyle(
        'BodyDarkBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=12.5,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=5
    )
    style_code = ParagraphStyle(
        'CodeStyle',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=3,
        spaceAfter=5
    )
    style_chip = ParagraphStyle(
        'Chip',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9,
        alignment=1
    )

    story = []

    # ==========================================
    # CAPA
    # ==========================================
    story.append(Spacer(1, 2.5 * cm))
    story.append(Paragraph("Relatório de Auditoria de Segurança", style_cover_title))
    story.append(Paragraph("<b>Projeto:</b> FutStats (futebol-analise) &nbsp;|&nbsp; <b>Data:</b> 03 de Setembro de 2026", style_cover_sub))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#0284C7"), spaceAfter=20))

    meta_text = """
    <b>Escopo Auditado:</b> Repositório completo (frontend Vanilla JS PWA, Vercel Serverless Functions em Node.js, Deno Edge Function e scripts de banco Supabase PostgreSQL).<br/><br/>
    <b>Nota Metodológica e Mapeamento para a Stack:</b><br/>
    A auditoria inspecionou rigorosamente o código-fonte em busca de 5 categorias essenciais de segurança, adaptadas à arquitetura serverless/client-side do FutStats:
    <br/><br/>
    • <b>1. BANCO SEM TRANCA (Isolamento de Inquilino/Dono):</b> Avaliação das políticas de Row Level Security (RLS) no Supabase PostgreSQL (tabela <code>push_subscriptions</code>) e análise de queries/operações anônimas de listagem, inserção e deleção.<br/>
    • <b>2. PERMISSÃO DEFINIDA NO NAVEGADOR:</b> Confronto entre o controle de rotas no cliente e a validação de privilégios de execução no backend para rotas críticas (como o disparador em massa do robô de alertas em <code>api/cron-alerts.js</code>).<br/>
    • <b>3. IDOR (Insecure Direct Object Reference):</b> Verificação de todos os handlers de rota em <code>api/</code> para identificar busca, alteração ou exclusão de objetos baseados em parâmetros sem comprovação de posse ou autenticação.<br/>
    • <b>4. CHAVES EXPOSTAS (Hardcode & Defaults):</b> Varredura estática de API keys, tokens JWT, chaves privadas VAPID e credenciais de deploy embutidas em código, fallbacks, bundles públicos e histórico git.<br/>
    • <b>5. INPUTS SEM TRATAMENTO (XSS):</b> Inspeção de todas as 94 atribuições a <code>innerHTML</code> no frontend, atributos <code>href</code>/<code>src</code> com dados externos e validação de esquemas de protocolo (ex: <code>javascript:</code>).
    """
    story.append(Paragraph(meta_text, style_meta))
    story.append(Spacer(1, 2 * cm))

    capa_summary_data = [
        [Paragraph("<b>Status da Avaliação:</b> AÇÃO REQUERIDA", style_meta), Paragraph("<b>Total de Achados:</b> 9", style_meta)],
        [Paragraph("<b>Vulnerabilidades Críticas:</b> 3", style_meta), Paragraph("<b>Vulnerabilidades Altas:</b> 4", style_meta)],
        [Paragraph("<b>Vulnerabilidades Médias:</b> 2", style_meta), Paragraph("<b>Pontos Fortes Validados:</b> 6", style_meta)]
    ]
    t_capa = Table(capa_summary_data, colWidths=[8.5 * cm, 8.5 * cm])
    t_capa.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F1F5F9")),
        ('PADDING', (0,0), (-1,-1), 8),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
    ]))
    story.append(t_capa)
    story.append(PageBreak())

    # ==========================================
    # RESUMO EXECUTIVO E GRÁFICOS
    # ==========================================
    story.append(Paragraph("1. Resumo Executivo", style_h1))
    story.append(Paragraph(
        "A auditoria de segurança identificou <b>9 vulnerabilidades confirmadas</b> no código-fonte, das quais <b>3 são Críticas</b>, <b>4 são Altas</b> e <b>2 são Médias</b>. "
        "Os riscos centrais decorrem de políticas permissivas de RLS no banco Supabase que expõem assinaturas a extração ou deleção em massa, "
        "chaves privadas (VAPID) e de API gravadas no código como valores de fallback, ausência de restrição de acesso por padrão no robô de alertas (Fail-Open), "
        "manipulação de inscrições por IDOR e ausência de sanitização de protocolo em links de notícias externas (XSS via pseudo-protocolo).",
        style_body
    ))
    story.append(Spacer(1, 6))

    chart_table_data = [
        [Image(DONUT_CHART_PATH, width=7.2*cm, height=5.5*cm), Image(BAR_CHART_PATH, width=9.8*cm, height=5.5*cm)]
    ]
    t_charts = Table(chart_table_data, colWidths=[7.5*cm, 10.0*cm])
    t_charts.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('PADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(t_charts)
    story.append(Spacer(1, 10))

    # ==========================================
    # PONTOS FORTES E PONTOS FRACOS
    # ==========================================
    story.append(Paragraph("2. Pontos Fortes e Riscos Centrais", style_h1))
    
    story.append(Paragraph("<font color='#059669'><b>[+] Pontos Fortes Verificados no Código:</b></font>", style_body_bold))
    fortes_text = """
    • <b>Proteção SSRF no Proxy de Imagens (<code>api/img.js</code>):</b> O endpoint valida rigorosamente se a URL solicitada inicia com <code>https://media.api-sports.io/</code>, impedindo acesso a redes internas (ex: metadados de nuvem 169.254.169.254).<br/>
    • <b>Lista Branca de Endpoints no Proxy da API (<code>api/football.js</code>):</b> Implementação de um <code>Set</code> estrito (<code>ALLOWED_ENDPOINTS</code>) que rejeita qualquer tentativa de consulta a endpoints administrativos ou não autorizados da API-Sports.<br/>
    • <b>Escape HTML Generalizado no Frontend (<code>public/app.js</code>):</b> A função <code>escapeHtml()</code> é empregada em dezenas de pontos de exibição dinâmica (nomes de jogadores, times, placares e rodadas), prevenindo XSS tradicional em tags HTML.<br/>
    • <b>Ausência de Avaliação Dinâmica (Eval):</b> Nenhuma chamada a <code>eval()</code>, <code>new Function()</code> ou scripts dinâmicos de terceiros foi detectada no código de produção.<br/>
    • <b>Respostas Estruturadas JSON no Backend:</b> Todas as Serverless Functions respondem com <code>res.json()</code> ou buffers de imagem, eliminando injeção de HTML no lado do servidor.<br/>
    • <b>Tratamento Seguro de Push no Service Worker (<code>public/sw.js</code>):</b> O evento <code>push</code> realiza parsing seguro de JSON sem executar scripts embutidos no corpo da notificação.
    """
    story.append(Paragraph(fortes_text, style_body))
    story.append(Spacer(1, 4))

    story.append(Paragraph("<font color='#B91C1C'><b>[-] Pontos Fracos (Riscos Centrais):</b></font>", style_body_bold))
    fracos_text = """
    • <b>Vazamento e Deleção Global no Supabase (RLS Aberta):</b> Políticas com <code>FOR SELECT TO anon USING (true)</code> e <code>FOR DELETE TO anon USING (true)</code> tornam o banco de inscrições totalmente acessível e destrutível por qualquer usuário.<br/>
    • <b>Comprometimento Criptográfico WebPush:</b> A presença da chave privada VAPID no código permite falsificação e envio de notificações push maliciosas a todos os dispositivos cadastrados.<br/>
    • <b>Execução Não Autorizada do Robô de Alertas (Fail-Open):</b> Ausência de validação obrigatória de <code>CRON_SECRET</code> permite que terceiros sobrecarreguem a cota da API-Sports e façam spam push.<br/>
    • <b>Ausência de Validação de Protocolo de URL (XSS):</b> Links provenientes de feeds RSS são inseridos em tags <code>&lt;a href="..."&gt;</code> sem checagem de esquema <code>http/https</code>.
    """
    story.append(Paragraph(fracos_text, style_body))
    story.append(PageBreak())

    # ==========================================
    # TABELA DETALHADA DE ACHADOS
    # ==========================================
    story.append(Paragraph("3. Tabela Detalhada de Achados por Categoria", style_h1))
    story.append(Paragraph("Abaixo estão listadas todas as 9 vulnerabilidades verificadas diretamente no código-fonte:", style_body))
    story.append(Spacer(1, 6))

    findings_table_data = [
        [
            Paragraph("<b>Sev.</b>", style_chip),
            Paragraph("<b>Categoria</b>", style_chip),
            Paragraph("<b>Arquivo e Linha(s)</b>", style_chip),
            Paragraph("<b>Descrição e Impacto</b>", style_chip)
        ],
        [
            Paragraph("<font color='#B91C1C'><b>CRÍTICA</b></font>", style_chip),
            Paragraph("1. Banco sem Tranca", style_body),
            Paragraph("<code>supabase/schema_rls.sql:33-47</code>", style_code),
            Paragraph("Políticas RLS permitem que qualquer cliente anônimo faça <b>SELECT irrestrito</b> (extraindo todos os tokens push e aparelhos) e <b>DELETE global</b> (limpando a base de dados).", style_body)
        ],
        [
            Paragraph("<font color='#B91C1C'><b>CRÍTICA</b></font>", style_chip),
            Paragraph("4. Chaves Expostas", style_body),
            Paragraph("<code>api/cron-alerts.js:14</code><br/><code>api/subscribe.js:11</code>", style_code),
            Paragraph("<b>Chave Privada VAPID embutida</b> como fallback no código-fonte. Permite assinatura e envio forjado de pushes maliciosos a todos os usuários da aplicação.", style_body)
        ],
        [
            Paragraph("<font color='#B91C1C'><b>CRÍTICA</b></font>", style_chip),
            Paragraph("4. Chaves Expostas", style_body),
            Paragraph("<code>api/cron-alerts.js:8</code><br/><code>.env.local:2</code>", style_code),
            Paragraph("<b>Chave de Produção da API-Sports hardcoded</b> no código e no arquivo de ambiente local. Risco de exaustão de cota contratada e custos indevidos.", style_body)
        ],
        [
            Paragraph("<font color='#EA580C'><b>ALTA</b></font>", style_chip),
            Paragraph("2. Permissão no Navegador", style_body),
            Paragraph("<code>api/cron-alerts.js:30-37</code>", style_code),
            Paragraph("<b>Fail-Open na verificação de CRON_SECRET:</b> se a variável não estiver definida, a checagem é ignorada. Permite acionamento público ilimitado do robô de alertas.", style_body)
        ],
        [
            Paragraph("<font color='#EA580C'><b>ALTA</b></font>", style_chip),
            Paragraph("3. IDOR", style_body),
            Paragraph("<code>api/subscribe.js:30-47,60-70</code>", style_code),
            Paragraph("Handler de deleção e atualização aceita qualquer <code>endpoint</code> sem autenticação ou validação de posse, permitindo exclusão ou adulteração de inscrições alheias.", style_body)
        ],
        [
            Paragraph("<font color='#EA580C'><b>ALTA</b></font>", style_chip),
            Paragraph("4. Chaves Expostas", style_body),
            Paragraph("<code>.env.local:3</code>", style_code),
            Paragraph("<b>Token de Autenticação Vercel OIDC</b> gravado em arquivo local commitável, contendo identificadores da equipe, usuário e projeto de deploy.", style_body)
        ],
        [
            Paragraph("<font color='#EA580C'><b>ALTA</b></font>", style_chip),
            Paragraph("5. Inputs sem Tratamento", style_body),
            Paragraph("<code>public/app.js:1438</code>", style_code),
            Paragraph("<b>XSS via URL Scheme em links de notícias:</b> <code>escapeHtml(item.link)</code> não valida se o protocolo inicia com <code>http/https</code>, permitindo <code>javascript:</code>.", style_body)
        ],
        [
            Paragraph("<font color='#D97706'><b>MÉDIA</b></font>", style_chip),
            Paragraph("5. Inputs sem Tratamento", style_body),
            Paragraph("<code>public/app.js:6077,6140</code>", style_code),
            Paragraph("Interpolação de URLs de escudos e logos lidos de <code>localStorage</code> em atributos <code>src</code> de tags <code>&lt;img&gt;</code> sem sanitização ou escape.", style_body)
        ],
        [
            Paragraph("<font color='#D97706'><b>MÉDIA</b></font>", style_chip),
            Paragraph("4. Chaves Expostas", style_body),
            Paragraph("Histórico Git<br/>(<code>commits 1c6bb3c, 2047590</code>)", style_code),
            Paragraph("Credenciais e tokens presentes no histórico de alterações do Git. Mesmo removidos da árvore atual, permanecem acessíveis na árvore histórica.", style_body)
        ]
    ]

    t_findings = Table(findings_table_data, colWidths=[2.2*cm, 3.6*cm, 4.2*cm, 7.5*cm])
    t_findings.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('PADDING', (0,0), (-1,-1), 5),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]))
    story.append(t_findings)
    story.append(Spacer(1, 10))

    # ==========================================
    # RECOMENDAÇÕES PRIORIZADAS
    # ==========================================
    story.append(Paragraph("4. Recomendações Priorizadas de Correção", style_h1))
    recom_text = """
    <b>Prioridade 1 (P1 — Imediato / Crítico):</b><br/>
    1. <b>Ajustar Políticas RLS no Supabase:</b> Revogar <code>SELECT</code> e <code>DELETE</code> irrestritos para a role <code>anon</code>. O robô de alertas deve consultar a tabela utilizando estritamente a <code>service_role</code> (com chave segura no ambiente da Vercel).<br/>
    2. <b>Rotacionar Chaves e Eliminar Fallbacks Hardcoded:</b> Gerar um novo par de chaves VAPID (<code>web-push generate-vapid-keys</code>) e revogar a chave da API-Sports. Cadastrar as novas chaves exclusivamente nas variáveis de ambiente da Vercel (sem defaults no código).<br/><br/>
    
    <b>Prioridade 2 (P2 — Curto Prazo / Alto):</b><br/>
    3. <b>Impor Fail-Closed no Robô de Alertas (<code>api/cron-alerts.js</code>):</b> Exigir obrigatoriamente a presença de <code>CRON_SECRET</code> ou validação do header <code>x-vercel-cron</code> para autorizar a execução, retornando HTTP 401 se ausente.<br/>
    4. <b>Sanitização de URLs Externas (<code>public/app.js</code>):</b> Implementar a função <code>sanitizeUrl()</code> validando que qualquer link externo de notícias inicie estritamente com <code>http://</code> ou <code>https://</code> antes de renderizar em tags <code>&lt;a href&gt;</code>.<br/>
    5. <b>Proteção IDOR em Subscrições:</b> Exigir validação criptográfica (ex: conferência de <code>auth</code> secret ou hash da inscrição) antes de processar exclusões ou atualizações em <code>api/subscribe.js</code>.<br/><br/>

    <b>Prioridade 3 (P3 — Médio Prazo / Higiene de Segurança):</b><br/>
    6. <b>Expurgo do Histórico Git:</b> Executar <code>git-filter-repo</code> ou BFG Repo-Cleaner para remover commits contendo chaves antigas e forçar novo push com histórico limpo.<br/>
    7. <b>Remoção do Token OIDC:</b> Excluir <code>VERCEL_OIDC_TOKEN</code> de <code>.env.local</code> e incluir o arquivo no <code>.gitignore</code> caso ainda não esteja.
    """
    story.append(Paragraph(recom_text, style_body))
    story.append(PageBreak())

    # ==========================================
    # SEÇÃO DE ISSUES PARA O GITHUB
    # ==========================================
    story.append(Paragraph("5. Issues Prontas para o GitHub", style_h1))
    story.append(Paragraph(
        "Abaixo estão formatadas as issues prontas para abertura no repositório GitHub. Cada bloco contém o texto completo em Markdown delimitado.",
        style_body
    ))
    story.append(Spacer(1, 6))

    issues_data = [
        ("--- ISSUE 1 ---",
         "[Segurança] [Crítica] Políticas RLS permissivas expõem tabela push_subscriptions a vazamento e deleção em massa",
         "security, severidade:critica, database, rls",
         "A tabela push_subscriptions no Supabase possui políticas de RLS excessivamente permissivas configuradas para a role 'anon'. Qualquer requisitante não autenticado pode executar um SELECT irrestrito para baixar todas as inscrições push (incluindo endpoints, chaves criptográficas p256dh e auth) ou executar um DELETE sem restrições, apagando todas as inscrições da base.",
         "Arquivo: supabase/schema_rls.sql:33-47\n"
         "CREATE POLICY \"Permitir delete anonimo por endpoint\" ON push_subscriptions FOR DELETE TO anon USING (true);\n"
         "CREATE POLICY \"Permitir select de assinaturas\" ON push_subscriptions FOR SELECT TO anon, service_role USING (true);",
         "Exposição de dados privados de navegação e aparelhos de todos os usuários, além de Negação de Serviço (DoS) permanente com apagamento de todos os assinantes.",
         "1. Remover permissão de SELECT da role 'anon'. Apenas a 'service_role' deve ter acesso a SELECT.\n"
         "2. Restringir DELETE para exigir correspondência com o endpoint informado no cabeçalho ou body validado.\n"
         "3. Configurar SUPABASE_SERVICE_ROLE_KEY no painel da Vercel para que o robô api/cron-alerts consulte os assinantes de forma segura.",
         "[ ] SELECT na tabela push_subscriptions retorna vazio/negado para a role anon.\n"
         "[ ] Operações de DELETE irrestritas sem filtro são bloqueadas pelo banco.\n"
         "[ ] O robô de alertas na Vercel utiliza service_role autenticada para leitura."),

        ("--- ISSUE 2 ---",
         "[Segurança] [Crítica] Chave Privada VAPID e chave da API-Football hardcoded no código-fonte",
         "security, severidade:critica, secrets, backend",
         "As variáveis FOOTBALL_API_KEY e VAPID_PRIVATE_KEY possuem strings de credenciais reais embutidas como valores de fallback direto nos arquivos de backend (api/cron-alerts.js e api/subscribe.js), além de estarem gravadas em .env.local. A posse da VAPID_PRIVATE_KEY permite a qualquer terceiro gerar e assinar notificações WebPush fraudulentas em nome do FutStats para os aparelhos inscritos.",
         "Arquivo: api/cron-alerts.js:8, 14 | api/subscribe.js:11\n"
         "const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || \"a70fc65a67c10981ace9813a509db554\";\n"
         "const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || \"gWKwUrc5XBpYUOBExM1ha_M3ugoo5JbM7mQSMt4Lk_c\";",
         "Falsificação de notificações WebPush oficiais (phishing, malware), exaustão de cota na API-Sports e perda de controle da identidade criptográfica da aplicação.",
         "1. Rotacionar imediatamente as chaves VAPID (npx web-push generate-vapid-keys).\n"
         "2. Revogar e gerar nova chave na API-Sports.\n"
         "3. Remover todos os fallbacks do código-fonte e exigir validação de inicialização que encerre o processo caso as variáveis não estejam definidas na Vercel.\n"
         "4. Adicionar .env* ao .gitignore.",
         "[ ] Nenhuma chave ou token em texto plano nos arquivos .js.\n"
         "[ ] Aplicação encerra com erro amigável se variáveis obrigatórias não existirem.\n"
         "[ ] Novas chaves cadastradas estritamente nas variáveis de ambiente da Vercel."),

        ("--- ISSUE 3 ---",
         "[Segurança] [Alta] Fail-Open no robô de alertas permite execução não autorizada e exaustão de recursos",
         "security, severidade:alta, authorization, backend",
         "A verificação de autorização em api/cron-alerts.js está encapsulada dentro de um bloco 'if (process.env.CRON_SECRET)'. Se a variável não estiver configurada no ambiente, o bloco é pulado e a rota aceita qualquer requisição HTTP externa sem autenticação.",
         "Arquivo: api/cron-alerts.js:30-37\n"
         "if (process.env.CRON_SECRET) {\n"
         "  const authHeader = req.headers[\"authorization\"] || \"\";\n"
         "  const isVercelCron = req.headers[\"x-vercel-cron\"] === \"1\";\n"
         "  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {\n"
         "    return res.status(401).json({ error: \"Acesso não autorizado...\" });\n"
         "  }\n"
         "}",
         "Exaustão da cota da API externa via chamadas repetitivas, disparo indevido de pushes repetidos (spam) e custos financeiros adicionais.",
         "1. Implementar padrão Fail-Closed: a rota deve SEMPRE exigir autorização válida.\n"
         "2. Rejeitar com 401 se a requisição não possuir o cabeçalho x-vercel-cron da Vercel ou o Bearer token configurado.",
         "[ ] Requisições externas diretas sem token retornam 401 Unauthorized.\n"
         "[ ] Apenas Vercel Cron ou clientes autorizados conseguem disparar o ciclo."),

        ("--- ISSUE 4 ---",
         "[Segurança] [Alta] IDOR na gestão de subscrições em api/subscribe.js",
         "security, severidade:alta, idor, backend",
         "O endpoint api/subscribe.js aceita requisições DELETE e POST informando apenas a URL do 'endpoint' push, sem autenticar o requisitante nem verificar a posse da chave 'auth'. Isso permite que um atacante que conheça o endpoint de outro torcedor delete ou altere arbitrariamente sua inscrição.",
         "Arquivo: api/subscribe.js:30-47\n"
         "if (req.method === 'DELETE') {\n"
         "  const endpoint = req.query.endpoint || (req.body && req.body.endpoint);\n"
         "  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, ...);\n"
         "}",
         "Manipulação e exclusão não autorizada de inscrições de outros usuários (IDOR).",
         "1. Exigir que a requisição de DELETE inclua a chave criptográfica auth correspondente para validar a titularidade do aparelho.\n"
         "2. No POST de atualização, validar se o endpoint já existente confere com a chave auth antes de sobrescrever preferências.",
         "[ ] Deleção de endpoint exige correspondência com a chave auth.\n"
         "[ ] Não é possível sobrescrever preferências de endpoints de terceiros sem a chave criptográfica."),

        ("--- ISSUE 5 ---",
         "[Segurança] [Alta] XSS via esquema de URL javascript: em links de matérias externas",
         "security, severidade:alta, frontend, xss",
         "A função escapeHtml() em public/app.js substitui apenas caracteres HTML especiais (<, >, \", ', &) mas não valida o esquema do protocolo da URL. Na renderização de notícias esportivas recebidas de feeds RSS, o link do item é atribuído diretamente ao atributo href sem validar se inicia com http:// ou https://, viabilizando execução de código via javascript:.",
         "Arquivo: public/app.js:1438\n"
         "<a class=\"news-card-item\" href=\"${escapeHtml(item.link)}\" target=\"_blank\" rel=\"noopener noreferrer\" ...>",
         "Execução arbitrária de scripts no navegador da vítima caso um feed RSS externo ou payload forjado contenha um link com protocolo javascript:.",
         "1. Criar a função sanitizeUrl(url) que valida estritamente a URL contra protocolos permitidos (http: e https:).\n"
         "2. Aplicar sanitizeUrl() em todos os atributos href que recebem dados dinâmicos.",
         "[ ] Links com protocolo javascript: são convertidos para '#' ou bloqueados.\n"
         "[ ] Apenas URLs seguras (http/https) são renderizadas no atributo href."),

        ("--- ISSUE 6 ---",
         "[Segurança] [Média] Token OIDC da Vercel exposto em arquivo de configuração local",
         "security, severidade:media, git, devops",
         "O arquivo .env.local contém uma variável VERCEL_OIDC_TOKEN com um token JWT assinado pela Vercel contendo identificadores da conta de equipe, usuário e projeto de deploy.",
         "Arquivo: .env.local:3\n"
         "VERCEL_OIDC_TOKEN=\"eyJhbGciOiJSUzI1NiIs...\"",
         "Exposição de metadados internos de infraestrutura da equipe de desenvolvimento na Vercel.",
         "1. Remover VERCEL_OIDC_TOKEN do arquivo .env.local.\n"
         "2. Assegurar que .env.local e arquivos de ambiente estejam listados no .gitignore.",
         "[ ] Arquivo .env.local não contém tokens sensíveis commitados.\n"
         "[ ] .gitignore inclui todos os padrões de arquivos de ambiente.")
    ]

    for delimiter, title, labels, desc, evid, impact, sol, accept in issues_data:
        issue_content = []
        issue_content.append(Paragraph(f"<b>{html.escape(delimiter)}</b>", style_h2))
        issue_content.append(Paragraph(f"<b>Título:</b> {html.escape(title)}", style_body_bold))
        issue_content.append(Paragraph(f"<b>Labels sugeridas:</b> <code>{html.escape(labels)}</code>", style_body))
        issue_content.append(Paragraph(f"<b>Descrição do Problema:</b> {html.escape(desc)}", style_body))
        issue_content.append(Paragraph("<b>Evidência de Código:</b>", style_body_bold))
        
        escaped_evid = html.escape(evid).replace('\n', '<br/>')
        issue_content.append(Paragraph(f"<code>{escaped_evid}</code>", style_code))
        
        issue_content.append(Paragraph(f"<b>Impacto:</b> {html.escape(impact)}", style_body))
        issue_content.append(Paragraph("<b>Sugestão de Correção:</b>", style_body_bold))
        issue_content.append(Paragraph(html.escape(sol).replace('\n', '<br/>'), style_body))
        issue_content.append(Paragraph("<b>Critérios de Aceite:</b>", style_body_bold))
        issue_content.append(Paragraph(html.escape(accept).replace('\n', '<br/>'), style_body))
        issue_content.append(Paragraph(f"<b>--- FIM {html.escape(delimiter.replace('--- ', ''))}</b>", style_h2))
        issue_content.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#CBD5E1"), spaceAfter=10))

        story.append(KeepTogether(issue_content))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Relatório PDF gerado com sucesso em: {PDF_PATH}")


if __name__ == "__main__":
    generate_charts()
    build_pdf()
