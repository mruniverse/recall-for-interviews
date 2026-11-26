// Interface copy for the low-fidelity study flow. Every string exists in both locales; the whole
// screen follows the chosen locale, card content included, with no fallback to the other one.
import type { Topic } from '../content/deck.ts';
import type { Rating } from '../scheduler/schedule.ts';
import { NEW_CARDS_PER_DAY } from '../storage/storage.ts';

export const LOCALES = ['en', 'pt-BR'] as const;
export type StudyLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: StudyLocale = 'en';

/** Each language is named in itself, so the selector reads correctly in either locale. */
export const LOCALE_NAMES: Record<StudyLocale, string> = { en: 'English', 'pt-BR': 'Português (Brasil)' };

export const isStudyLocale = (value: unknown): value is StudyLocale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

const MONTHS: Record<StudyLocale, readonly string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  'pt-BR': ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
};

const dayNumber = (civilDate: string) => Date.parse(`${civilDate}T00:00:00.000Z`) / 86_400_000;

/**
 * @param civilDate Stored YYYY-MM-DD date; formatted as written, never shifted by a timezone.
 * @param locale
 * @returns For example `December 3, 2026` or `3 de dezembro de 2026`.
 */
export function formatCivilDate(civilDate: string, locale: StudyLocale): string {
  const [year, month, day] = civilDate.split('-').map(Number);
  const name = MONTHS[locale][month - 1];
  return locale === 'en' ? `${name} ${day}, ${year}` : `${day} de ${name} de ${year}`;
}

/**
 * @param dueDate Stored YYYY-MM-DD due date.
 * @param today Today's civil date in the device timezone.
 * @param locale
 * @returns The date with its distance from today, for example `tomorrow (November 27, 2026)`.
 */
export function formatDueDate(dueDate: string, today: string, locale: StudyLocale): string {
  const days = Math.round(dayNumber(dueDate) - dayNumber(today));
  const date = formatCivilDate(dueDate, locale);
  const en = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  const pt = days <= 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`;
  return `${locale === 'en' ? en : pt} (${date})`;
}

const en = {
  appName: 'Recall for Interviews',
  prototypeLabel: 'Low-fidelity prototype · sample fixture deck, not reviewed · not a released app',
  loading: 'Loading…',
  storageUnavailable: 'Saved progress could not be opened on this device. Close and reopen the app to try again.',
  contentUnavailable: 'The questions are not available in this language. Choose another language.',
  language: 'Language',
  onboardingTitle: 'Practice recalling answers for technical interviews',
  onboardingPurpose:
    'Answer each question before you see the explanation. How you rate your answer decides when the question comes back.',
  topicsHeading: 'Topics',
  rulesHeading: 'How reviews work',
  rules: [
    'Correct (every required point covered): back in 7 days, then in 30 days.',
    'Partial or missed: back tomorrow.',
    `Up to ${NEW_CARDS_PER_DAY} new questions per day.`,
    'Drafts are not saved. If you leave the session or close the app, the current question and your draft are discarded; rated answers stay saved.',
    'Questions, reference answers and explanations are shown in the language you choose.',
  ],
  continue: 'Continue',
  todayTitle: 'Today',
  track: 'Track: Software Engineering',
  dueCount: (n: number) => `Due reviews: ${n}`,
  newCount: (n: number) => `New questions: ${n}`,
  startReview: 'Start review',
  starting: 'Preparing the queue…',
  emptyDeck: 'This deck has no questions.',
  caughtUp: 'All caught up for today.',
  nextReview: (date: string) => `Next review: ${date}`,
  noReviewScheduled: 'No review is scheduled yet.',
  howItWorks: 'How it works',
  notices: {
    stale: 'This question changed since the session started. Nothing was saved for it, and the queue was refreshed.',
    'locale-unavailable': 'The questions are not available in that language yet. The language did not change.',
    'locale-not-saved': 'The language could not be saved on this device; it applies until the app closes.',
    'load-failed': 'The queue could not be loaded. Try again.',
  },
  progress: (position: number, total: number) => `Question ${position} of ${total}`,
  kind: { due: 'Review', new: 'New' },
  openInstructions: 'Answer in your head, out loud (nothing is recorded) or in writing.',
  draftDisclosure: 'Your draft is not saved.',
  answerLabel: 'Your answer (optional)',
  choiceInstructions: 'Choose one option, then submit your answer.',
  choiceSelected: 'Selected',
  submit: 'Submit answer',
  dontKnow: "I don't know",
  leaveSession: 'Leave session',
  leaveTitle: 'Leave this session?',
  leaveBody: 'The current question and your draft will be discarded. Rated answers stay saved.',
  leaveConfirm: 'Leave',
  cancel: 'Cancel',
  feedbackTitle: 'Compare your answer',
  yourAnswer: 'Your answer',
  noWrittenAnswer: 'You did not write an answer.',
  gaveUp: 'You chose “I don\'t know”.',
  reference: 'Reference answer',
  checklist: 'Checklist',
  required: 'Required',
  optional: 'Optional',
  explanation: 'Explanation',
  rateHeading: 'Rate your answer',
  rateRule: 'Correct only if you covered every required item; Partial if you covered some; Missed if none.',
  gaveUpRule: 'After “I don\'t know”, the answer counts as missed.',
  ratings: { correct: 'Correct', partial: 'Partial', missed: 'Missed' } satisfies Record<Rating, string>,
  choiceCorrect: 'Result: correct',
  choiceWrong: 'Result: incorrect',
  choiceGaveUp: 'Result: not answered (counts as missed)',
  yourChoice: 'Your choice',
  correctChoice: 'Correct answer',
  whyWrong: 'Why it is wrong',
  saving: 'Saving…',
  saved: (rating: string, due: string) => `Saved as ${rating}. Next review: ${due}`,
  saveBusy: 'Could not save because the database is busy. Your feedback is still here.',
  saveFailed: 'Could not save this answer. Your feedback is still here.',
  retrySave: 'Try saving again',
  nextQuestion: 'Next question',
  seeSummary: 'See summary',
  summaryTitle: 'Session complete',
  summaryCounts: (total: number, correct: number, partial: number, missed: number) =>
    `Answered ${total}: ${correct} correct, ${partial} partial, ${missed} missed.`,
  backToToday: 'Back to Today',
  topics: {
    'system-design': 'System design',
    networking: 'Networking',
    databases: 'Databases',
    algorithms: 'Algorithms',
  } satisfies Record<Topic, string>,
};

export type Copy = typeof en;

const ptBR: Copy = {
  appName: 'Recall for Interviews',
  prototypeLabel: 'Protótipo de baixa fidelidade · baralho de exemplo (fixtures), não revisado · não é um app publicado',
  loading: 'Carregando…',
  storageUnavailable: 'Não foi possível abrir o progresso salvo neste aparelho. Feche e abra o app para tentar de novo.',
  contentUnavailable: 'As perguntas não estão disponíveis neste idioma. Escolha outro idioma.',
  language: 'Idioma',
  onboardingTitle: 'Pratique lembrar respostas para entrevistas técnicas',
  onboardingPurpose:
    'Responda cada pergunta antes de ver a explicação. A avaliação que você der à sua resposta decide quando a pergunta volta.',
  topicsHeading: 'Temas',
  rulesHeading: 'Como funcionam as revisões',
  rules: [
    'Acertou (cobriu todos os pontos obrigatórios): volta em 7 dias, depois em 30 dias.',
    'Parcial ou não acertou: volta amanhã.',
    `Até ${NEW_CARDS_PER_DAY} perguntas novas por dia.`,
    'Rascunhos não são salvos. Se você sair da sessão ou fechar o app, a pergunta atual e o rascunho são descartados; respostas avaliadas continuam salvas.',
    'Perguntas, respostas de referência e explicações aparecem no idioma escolhido.',
  ],
  continue: 'Continuar',
  todayTitle: 'Hoje',
  track: 'Trilha: Engenharia de Software',
  dueCount: (n) => `Revisões pendentes: ${n}`,
  newCount: (n) => `Perguntas novas: ${n}`,
  startReview: 'Começar revisão',
  starting: 'Preparando a fila…',
  emptyDeck: 'Este baralho não tem perguntas.',
  caughtUp: 'Tudo em dia por hoje.',
  nextReview: (date) => `Próxima revisão: ${date}`,
  noReviewScheduled: 'Nenhuma revisão agendada ainda.',
  howItWorks: 'Como funciona',
  notices: {
    stale: 'Esta pergunta mudou desde o início da sessão. Nada foi salvo para ela, e a fila foi atualizada.',
    'locale-unavailable': 'As perguntas ainda não estão disponíveis nesse idioma. O idioma não mudou.',
    'locale-not-saved': 'Não foi possível salvar o idioma neste aparelho; ele vale até o app ser fechado.',
    'load-failed': 'Não foi possível carregar a fila. Tente de novo.',
  },
  progress: (position, total) => `Pergunta ${position} de ${total}`,
  kind: { due: 'Revisão', new: 'Nova' },
  openInstructions: 'Responda mentalmente, em voz alta (nada é gravado) ou por escrito.',
  draftDisclosure: 'Seu rascunho não é salvo.',
  answerLabel: 'Sua resposta (opcional)',
  choiceInstructions: 'Escolha uma opção e depois envie sua resposta.',
  choiceSelected: 'Selecionada',
  submit: 'Enviar resposta',
  dontKnow: 'Não sei',
  leaveSession: 'Sair da sessão',
  leaveTitle: 'Sair desta sessão?',
  leaveBody: 'A pergunta atual e o rascunho serão descartados. Respostas avaliadas continuam salvas.',
  leaveConfirm: 'Sair',
  cancel: 'Cancelar',
  feedbackTitle: 'Compare sua resposta',
  yourAnswer: 'Sua resposta',
  noWrittenAnswer: 'Você não escreveu uma resposta.',
  gaveUp: 'Você escolheu “Não sei”.',
  reference: 'Resposta de referência',
  checklist: 'Itens de avaliação',
  required: 'Obrigatório',
  optional: 'Opcional',
  explanation: 'Explicação',
  rateHeading: 'Avalie sua resposta',
  rateRule: 'Acertei só se você cobriu todos os itens obrigatórios; Parcial se cobriu alguns; Não acertei se nenhum.',
  gaveUpRule: 'Depois de “Não sei”, a resposta conta como não acertada.',
  ratings: { correct: 'Acertei', partial: 'Parcial', missed: 'Não acertei' },
  choiceCorrect: 'Resultado: correta',
  choiceWrong: 'Resultado: incorreta',
  choiceGaveUp: 'Resultado: sem resposta (conta como não acertada)',
  yourChoice: 'Sua escolha',
  correctChoice: 'Resposta correta',
  whyWrong: 'Por que está errada',
  saving: 'Salvando…',
  saved: (rating, due) => `Salvo como ${rating}. Próxima revisão: ${due}`,
  saveBusy: 'Não foi possível salvar porque o banco de dados está ocupado. Seu feedback continua aqui.',
  saveFailed: 'Não foi possível salvar esta resposta. Seu feedback continua aqui.',
  retrySave: 'Tentar salvar de novo',
  nextQuestion: 'Próxima pergunta',
  seeSummary: 'Ver resumo',
  summaryTitle: 'Sessão concluída',
  summaryCounts: (total, correct, partial, missed) =>
    `${total} respondidas: ${correct} certas, ${partial} parciais, ${missed} não acertadas.`,
  backToToday: 'Voltar para Hoje',
  topics: {
    'system-design': 'Design de sistemas',
    networking: 'Redes',
    databases: 'Bancos de dados',
    algorithms: 'Algoritmos',
  },
};

export const COPY: Record<StudyLocale, Copy> = { en, 'pt-BR': ptBR };
