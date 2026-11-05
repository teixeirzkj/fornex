import { Link, useParams } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { PageTransition } from '@/components/ui/motion'
import { Notice } from '@/components/ui/Feedback'
import { BRAND } from '@/lib/config'
import NotFound from './NotFound'

interface Section { title: string; paragraphs: string[] }
interface LegalDoc { title: string; intro: string; sections: Section[] }

const contact = BRAND.supportEmail || '[e-mail de contato]'

const DOCS: Record<string, LegalDoc> = {
  termos: {
    title: 'Termos de uso',
    intro: 'Estes termos regulam o uso da plataforma FORNEX. Ao criar uma conta, você declara que leu e concorda com as condições abaixo.',
    sections: [
      { title: '1. Sobre a plataforma', paragraphs: ['A FORNEX é uma plataforma digital que reúne informações de fornecedores para consulta por usuários cadastrados. A FORNEX não vende, não intermedeia pagamentos de mercadorias e não é responsável pelas negociações realizadas entre usuários e fornecedores.'] },
      { title: '2. Cadastro e conta', paragraphs: ['Para usar a área logada é necessário criar uma conta com informações verdadeiras. Você é responsável por manter a confidencialidade da sua senha e por todas as atividades realizadas na sua conta.', 'A conta é pessoal e intransferível. O compartilhamento de acesso pode levar à suspensão.'] },
      { title: '3. Planos, cobrança e cancelamento', paragraphs: ['Os planos pagos são cobrados de forma recorrente pelo processador de pagamentos indicado no checkout. A renovação é automática até o cancelamento.', 'O cancelamento pode ser feito a qualquer momento pelo painel. O acesso permanece até o fim do período já pago. [Definir política de reembolso e direito de arrependimento conforme o Código de Defesa do Consumidor.]'] },
      { title: '4. Uso permitido', paragraphs: ['É proibido copiar, extrair em massa, revender ou redistribuir as informações da plataforma, bem como usar meios automatizados (robôs, scrapers) para acessar o conteúdo.'] },
      { title: '5. Informações de fornecedores', paragraphs: ['As informações são fornecidas pelos próprios fornecedores, por integrações ou pela equipe, e exibem a data da última atualização. Recomendamos confirmar condições comerciais diretamente com o fornecedor antes de qualquer compra.'] },
      { title: '6. Limitação de responsabilidade', paragraphs: ['A FORNEX não garante resultados de vendas nem a qualidade, entrega ou conformidade de produtos de terceiros. [Revisar redação com assessoria jurídica.]'] },
      { title: '7. Alterações e contato', paragraphs: [`Estes termos podem ser atualizados, com aviso prévio no painel. Dúvidas: ${contact}.`] },
    ],
  },
  privacidade: {
    title: 'Política de privacidade',
    intro: 'Esta política explica como a FORNEX coleta, usa e protege dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).',
    sections: [
      { title: '1. Controlador', paragraphs: ['[Razão social, CNPJ e endereço do controlador.] Encarregado (DPO): [nome e e-mail do encarregado].'] },
      { title: '2. Dados coletados', paragraphs: ['Dados de cadastro: nome, e-mail, telefone e empresa (opcional).', 'Dados de uso: fornecedores favoritados, buscas realizadas e histórico de visualizações, usados para exibir seu próprio histórico no painel.', 'Dados de pagamento: processados pelo gateway de pagamento. A FORNEX não armazena número de cartão.'] },
      { title: '3. Finalidades e bases legais', paragraphs: ['Execução de contrato (prestação do serviço e cobrança), cumprimento de obrigação legal (registros fiscais e de acesso) e legítimo interesse (segurança e melhoria da plataforma). Comunicações de marketing dependem de consentimento.'] },
      { title: '4. Compartilhamento', paragraphs: ['Compartilhamos dados apenas com operadores necessários ao serviço — hospedagem e banco de dados, processamento de pagamentos e envio de e-mails — sob obrigações de confidencialidade.'] },
      { title: '5. Segurança e retenção', paragraphs: ['Adotamos controle de acesso por usuário, criptografia em trânsito e políticas de segurança no banco de dados. Os dados são mantidos enquanto a conta estiver ativa e pelos prazos legais aplicáveis.'] },
      { title: '6. Seus direitos', paragraphs: [`Você pode solicitar confirmação, acesso, correção, anonimização, portabilidade e exclusão dos seus dados, além de revogar consentimentos, pelo e-mail ${contact}.`] },
      { title: '7. Cookies e armazenamento local', paragraphs: ['Usamos armazenamento local do navegador para manter sua sessão conectada. [Descrever ferramentas de análise, se forem adotadas.]'] },
    ],
  },
}

export default function Legal() {
  const { doc } = useParams()
  const content = doc ? DOCS[doc] : undefined
  if (!content) return <NotFound />

  return (
    <PageTransition className="container-fx max-w-3xl py-16">
      <div className="flex items-center gap-3 text-fornex-ice"><FileText className="h-5 w-5" /><span className="text-sm font-semibold">Documento legal</span></div>
      <h1 className="mt-3 text-4xl font-extrabold text-white">{content.title}</h1>
      <div className="mt-6">
        <Notice tone="warning" title="Modelo — revisar com assessoria jurídica antes de publicar">
          Os trechos entre colchetes precisam ser preenchidos com os dados da empresa.
        </Notice>
      </div>
      <p className="mt-8 leading-relaxed text-muted">{content.intro}</p>
      <div className="mt-10 space-y-9">
        {content.sections.map((s) => (
          <section key={s.title}>
            <h2 className="text-lg font-bold text-fg">{s.title}</h2>
            {s.paragraphs.map((p) => <p key={p} className="mt-3 text-sm leading-relaxed text-muted">{p}</p>)}
          </section>
        ))}
      </div>
      <p className="mt-12 text-sm text-muted">
        Veja também: {doc === 'termos'
          ? <Link className="text-accent hover:underline" to="/legal/privacidade">Política de privacidade</Link>
          : <Link className="text-accent hover:underline" to="/legal/termos">Termos de uso</Link>}
      </p>
    </PageTransition>
  )
}
