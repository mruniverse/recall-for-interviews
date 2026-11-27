// The study flow as a framework-free state machine: React only renders `getState()` and forwards
// taps. Every action is a no-op unless it applies to the current state, which also absorbs double
// taps; async results are applied only while the prompt that started them is still on screen.
import type { Card, Deck } from '../content/deck.ts';
import type { Rating } from '../scheduler/schedule.ts';
import {
  DEFAULT_NEW_CARD_LIMIT,
  isNewCardLimit,
  StorageBusyError,
  type Attempt,
  type CommitResult,
  type NewCardLimit,
  type Storage,
  type Today,
} from '../storage/storage.ts';
import { localizeDeck, type CardLocalizer } from './content.ts';
import { DEFAULT_LOCALE, isStudyLocale, type Copy, type StudyLocale } from './copy.ts';
import { newAttemptId } from './ids.ts';

/** Preference key; its presence also means onboarding was completed. */
export const LOCALE_KEY = 'recall.locale';

/** The subset of expo-sqlite's kv-store used for the language preference. */
export interface PreferenceStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export type Notice = keyof Copy['notices'];

export interface TodayView {
  date: string;
  due: number;
  new: number;
  /** The daily new-card limit these counts were computed with. */
  newCardLimit: NewCardLimit;
  /** Earliest due date after today; null when none. */
  nextDueDate: string | null;
  /** `empty`: the deck has no active cards; `caught-up`: it has, but none is due or new today. */
  status: 'empty' | 'ready' | 'caught-up';
}

export interface QueueItem {
  cardId: string;
  revision: number;
  kind: 'due' | 'new';
}

type Pending = { rating: Rating; attemptedAt: Date; timeZone: string };

export type SaveState =
  | { status: 'idle' }
  | ({ status: 'saving' } & Pending)
  | ({ status: 'failed'; reason: 'busy' | 'error' } & Pending)
  | { status: 'saved'; attempt: Attempt };

export interface Prompt {
  item: QueueItem;
  /** Localized for the session's locale. */
  card: Card;
  /** Generated when the prompt is presented; every save of this prompt uses it. */
  attemptId: string;
  draft: string;
  selectedChoice: string | null;
  stage: 'answering' | 'feedback';
  gaveUp: boolean;
  save: SaveState;
}

export interface Session {
  /** Snapshot taken on Start; never extended. */
  queue: readonly QueueItem[];
  position: number;
  prompt: Prompt;
  saved: readonly Attempt[];
  finishing: boolean;
}

export interface Summary {
  answered: number;
  ratings: Record<Rating, number>;
  today: string;
  /** Civil date of the next review (today when more became due); null when none. */
  nextReview: string | null;
}

export type StudyState =
  | { screen: 'loading'; locale: StudyLocale }
  | { screen: 'unavailable'; locale: StudyLocale; problem: 'storage' | 'content' }
  | { screen: 'onboarding'; locale: StudyLocale; today: TodayView; notice: Notice | null }
  | {
      screen: 'today';
      locale: StudyLocale;
      today: TodayView;
      notice: Notice | null;
      starting: boolean;
      /** A new daily limit is being stored; Start and the settings wait for it. */
      savingLimit: boolean;
    }
  | { screen: 'study'; locale: StudyLocale; session: Session }
  | { screen: 'summary'; locale: StudyLocale; summary: Summary };

export interface StudyDependencies {
  openStorage: () => Promise<Storage>;
  preferences: PreferenceStore;
  deck: Deck;
  localize: CardLocalizer;
  now?: () => Date;
  /** IANA zone of the device, read at each attempt. */
  timeZone?: () => string;
  newAttemptId?: () => string;
}

export interface StudyController {
  getState(): StudyState;
  subscribe(listener: () => void): () => void;
  /** Reads the language preference, opens storage and shows onboarding (first run) or Today. */
  init(): Promise<void>;
  /** Available on onboarding, Today and a content error; never during a session. */
  chooseLocale(locale: StudyLocale): Promise<void>;
  /**
   * Recounts Today with `limit` and stores it as the daily new-card limit; on failure nothing changes.
   * Available on Today only, so a session's queue never changes. Values outside `NEW_CARD_LIMITS` are ignored.
   */
  chooseNewCardLimit(limit: NewCardLimit): Promise<void>;
  finishOnboarding(): Promise<void>;
  showOnboarding(): void;
  /** Reloads Today's counts; ignored outside onboarding and Today so a session queue stays frozen. */
  refresh(): Promise<void>;
  start(): Promise<void>;
  setDraft(text: string): void;
  /** Selects a multiple-choice option without submitting it. */
  selectChoice(choiceId: string): void;
  /** Open prompts reveal feedback; multiple choice grades the selected option and saves it. */
  submit(): Promise<void>;
  dontKnow(): Promise<void>;
  /** Self-rating of an open prompt; after "I don't know" only `missed` is accepted. */
  rate(rating: Rating): Promise<void>;
  /** Resubmits a failed save with the same attempt ID, rating and attempt instant. */
  retrySave(): Promise<void>;
  next(): Promise<void>;
  /** Discards the current prompt; ignored while a save is in flight. */
  leave(): Promise<void>;
  closeSummary(): Promise<void>;
  dispose(): Promise<void>;
}

const NO_RATINGS: Record<Rating, number> = { correct: 0, partial: 0, missed: 0 };

/**
 * @param deps
 * @returns A controller in the `loading` state; call `init()`.
 */
export function createStudy(deps: StudyDependencies): StudyController {
  const now = deps.now ?? (() => new Date());
  const deviceTimeZone = deps.timeZone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const nextAttemptId = deps.newAttemptId ?? newAttemptId;
  const cardIds = deps.deck.cards.map((card) => card.id);
  const listeners = new Set<() => void>();
  let state: StudyState = { screen: 'loading', locale: DEFAULT_LOCALE };
  let cards = new Map<string, Card>();
  let storage: Storage | null = null;
  // Loaded with storage; `storage !== null` implies it holds the stored preference.
  let newCardLimit: NewCardLimit = DEFAULT_NEW_CARD_LIMIT;
  let initialized = false;
  let onboarded = false;
  // Bumped when a valid limit choice or a refresh starts; a refresh publishes only if it is still the latest.
  let generation = 0;
  let preferenceWrites: Promise<unknown> = Promise.resolve();

  function set(next: StudyState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function applyLocale(locale: StudyLocale): boolean {
    try {
      cards = localizeDeck(deps.deck, locale, deps.localize);
      return true;
    } catch {
      return false;
    }
  }

  // Serialized so the last choice is the one stored.
  function persistLocale(locale: StudyLocale): Promise<boolean> {
    const write = preferenceWrites.then(() => deps.preferences.setItem(LOCALE_KEY, locale));
    preferenceWrites = write.catch(() => undefined);
    return write.then(
      () => true,
      () => false,
    );
  }

  function showNotice(notice: Notice, locale: StudyLocale) {
    if ((state.screen === 'today' || state.screen === 'onboarding') && state.locale === locale) {
      set({ ...state, notice });
    }
  }

  const readToday = (limit: NewCardLimit = newCardLimit): Promise<Today> =>
    storage!.loadToday({
      deckId: deps.deck.deckId,
      cardIds,
      now: now(),
      timeZone: deviceTimeZone(),
      newCardLimit: limit,
    });

  const view = (today: Today, limit: NewCardLimit): TodayView => ({
    date: today.today,
    due: today.due.length,
    new: today.new.length,
    newCardLimit: limit,
    nextDueDate: today.nextDueDate,
    status: cardIds.length === 0 ? 'empty' : today.due.length + today.new.length > 0 ? 'ready' : 'caught-up',
  });

  const loadView = async (limit: NewCardLimit = newCardLimit): Promise<TodayView> => view(await readToday(limit), limit);

  /** Today with no start or limit change in flight: the only state that accepts settings and Start. */
  const isIdleToday = (current: StudyState): current is Extract<StudyState, { screen: 'today' }> =>
    current.screen === 'today' && !current.starting && !current.savingLimit;

  async function connect() {
    const opened = await deps.openStorage();
    try {
      newCardLimit = await opened.loadNewCardLimit();
    } catch (error) {
      await opened.close().catch(() => undefined);
      throw error;
    }
    storage = opened;
  }

  async function enter(locale: StudyLocale) {
    if (!applyLocale(locale)) return set({ screen: 'unavailable', locale, problem: 'content' });
    let today: TodayView;
    try {
      if (!storage) await connect();
      today = await loadView();
    } catch {
      return set({ screen: 'unavailable', locale, problem: 'storage' });
    }
    set(
      onboarded
        ? { screen: 'today', locale, today, notice: null, starting: false, savingLimit: false }
        : { screen: 'onboarding', locale, today, notice: null },
    );
  }

  async function backToToday(notice: Notice | null) {
    const { locale } = state;
    set({ screen: 'loading', locale });
    try {
      set({ screen: 'today', locale, today: await loadView(), notice, starting: false, savingLimit: false });
    } catch {
      set({ screen: 'unavailable', locale, problem: 'storage' });
    }
  }

  const currentPrompt = (): Prompt | null => (state.screen === 'study' ? state.session.prompt : null);

  function patchPrompt(attemptId: string, patch: Partial<Prompt>, saved?: Attempt) {
    if (state.screen !== 'study' || state.session.prompt.attemptId !== attemptId) return;
    const { session } = state;
    set({
      ...state,
      session: {
        ...session,
        prompt: { ...session.prompt, ...patch },
        saved: saved ? [...session.saved, saved] : session.saved,
      },
    });
  }

  const present = (item: QueueItem): Prompt => ({
    item,
    card: cards.get(item.cardId)!,
    attemptId: nextAttemptId(),
    draft: '',
    selectedChoice: null,
    stage: 'answering',
    gaveUp: false,
    save: { status: 'idle' },
  });

  async function save(attemptId: string, rating: Rating, attemptedAt = now(), timeZone = deviceTimeZone()) {
    const prompt = currentPrompt();
    if (!storage || prompt?.attemptId !== attemptId) return;
    const pending = { rating, attemptedAt, timeZone };
    patchPrompt(attemptId, { save: { status: 'saving', ...pending } });
    let result: CommitResult;
    try {
      result = await storage.commitAttempt({
        attemptId,
        deckId: deps.deck.deckId,
        cardId: prompt.item.cardId,
        deckRevision: deps.deck.revision,
        expectedRevision: prompt.item.revision,
        rating,
        attemptedAt,
        timeZone,
      });
    } catch (error) {
      const reason = error instanceof StorageBusyError ? 'busy' : 'error';
      return patchPrompt(attemptId, { save: { status: 'failed', reason, ...pending } });
    }
    if (result.status === 'stale') {
      if (currentPrompt()?.attemptId === attemptId) await backToToday('stale');
      return;
    }
    patchPrompt(attemptId, { save: { status: 'saved', attempt: result.attempt } }, result.attempt);
  }

  function summarize(saved: readonly Attempt[], today: TodayView | null): Summary {
    const ratings = { ...NO_RATINGS };
    for (const attempt of saved) ratings[attempt.rating] += 1;
    const earliestSaved = saved.map((attempt) => attempt.dueDate).sort()[0] ?? null;
    return {
      answered: saved.length,
      ratings,
      today: today?.date ?? saved.at(-1)?.civilDate ?? '',
      nextReview: today ? (today.due > 0 ? today.date : today.nextDueDate) : earliestSaved,
    };
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async init() {
      if (initialized) return;
      initialized = true;
      let stored: string | null = null;
      try {
        stored = await deps.preferences.getItem(LOCALE_KEY);
      } catch {
        stored = null;
      }
      onboarded = isStudyLocale(stored);
      await enter(isStudyLocale(stored) ? stored : DEFAULT_LOCALE);
    },

    async chooseLocale(locale) {
      const current = state;
      if (current.screen === 'unavailable' && current.problem === 'content') {
        if (!applyLocale(locale)) return;
        set({ screen: 'loading', locale });
        const saved = !onboarded || (await persistLocale(locale));
        await enter(locale);
        if (!saved) showNotice('locale-not-saved', locale);
        return;
      }
      if (current.screen !== 'onboarding' && !isIdleToday(current)) return;
      if (!applyLocale(locale)) return set({ ...current, notice: 'locale-unavailable' });
      set({ ...current, locale, notice: null });
      // Before onboarding completes, the choice is stored by `finishOnboarding`.
      if (onboarded && !(await persistLocale(locale))) showNotice('locale-not-saved', locale);
    },

    async chooseNewCardLimit(limit) {
      const current = state;
      if (!isIdleToday(current) || !storage || !isNewCardLimit(limit)) return;
      generation += 1;
      set({ ...current, notice: null, savingLimit: true });
      // Counts first, then the write: if either fails, the previous limit and its counts stay.
      let today: TodayView;
      try {
        today = await loadView(limit);
        await storage.saveNewCardLimit(limit);
      } catch {
        if (state.screen === 'today') set({ ...state, notice: 'limit-not-saved', savingLimit: false });
        return;
      }
      newCardLimit = limit;
      if (state.screen === 'today') set({ ...state, today, notice: null, savingLimit: false });
    },

    async finishOnboarding() {
      const current = state;
      if (current.screen !== 'onboarding') return;
      onboarded = true;
      set({
        screen: 'today',
        locale: current.locale,
        today: current.today,
        notice: null,
        starting: false,
        savingLimit: false,
      });
      if (!(await persistLocale(current.locale))) showNotice('locale-not-saved', current.locale);
    },

    showOnboarding() {
      if (!isIdleToday(state)) return;
      set({ screen: 'onboarding', locale: state.locale, today: state.today, notice: null });
    },

    async refresh() {
      if (!storage || (state.screen !== 'onboarding' && state.screen !== 'today')) return;
      // Not while a limit is being stored or a session is starting: their counts would be read mid-write.
      if (state.screen === 'today' && (state.starting || state.savingLimit)) return;
      const started = ++generation;
      let today: TodayView;
      try {
        today = await loadView();
      } catch {
        return;
      }
      const current = state;
      // Superseded by a limit change or a newer refresh that started after this one: drop this result.
      if (started !== generation) return;
      if (current.screen === 'onboarding' || isIdleToday(current)) set({ ...current, today });
    },

    async start() {
      const current = state;
      if (!isIdleToday(current) || !storage) return;
      set({ ...current, notice: null, starting: true });
      const limit = newCardLimit;
      let today: Today;
      try {
        today = await readToday(limit);
      } catch {
        return set({ ...current, notice: 'load-failed', starting: false });
      }
      const queue: QueueItem[] = [
        ...today.due.map((card) => ({ ...card, kind: 'due' as const })),
        ...today.new.map((card) => ({ ...card, kind: 'new' as const })),
      ];
      const { locale } = current;
      if (queue.length === 0) {
        return set({ screen: 'today', locale, today: view(today, limit), notice: null, starting: false, savingLimit: false });
      }
      set({
        screen: 'study',
        locale,
        session: { queue: Object.freeze(queue), position: 0, prompt: present(queue[0]), saved: [], finishing: false },
      });
    },

    setDraft(text) {
      const prompt = currentPrompt();
      if (prompt?.stage === 'answering' && prompt.card.type === 'open') patchPrompt(prompt.attemptId, { draft: text });
    },

    selectChoice(choiceId) {
      const prompt = currentPrompt();
      if (prompt?.stage !== 'answering' || prompt.card.type !== 'multiple-choice') return;
      if (prompt.card.choices.some((choice) => choice.id === choiceId)) {
        patchPrompt(prompt.attemptId, { selectedChoice: choiceId });
      }
    },

    async submit() {
      const prompt = currentPrompt();
      if (prompt?.stage !== 'answering') return;
      if (prompt.card.type === 'open') return patchPrompt(prompt.attemptId, { stage: 'feedback' });
      if (prompt.selectedChoice === null) return;
      patchPrompt(prompt.attemptId, { stage: 'feedback' });
      await save(prompt.attemptId, prompt.selectedChoice === prompt.card.answer ? 'correct' : 'missed');
    },

    async dontKnow() {
      const prompt = currentPrompt();
      if (prompt?.stage !== 'answering') return;
      patchPrompt(prompt.attemptId, { stage: 'feedback', gaveUp: true, selectedChoice: null });
      if (prompt.card.type === 'multiple-choice') await save(prompt.attemptId, 'missed');
    },

    async rate(rating) {
      const prompt = currentPrompt();
      if (prompt?.stage !== 'feedback' || prompt.card.type !== 'open' || prompt.save.status !== 'idle') return;
      if (prompt.gaveUp && rating !== 'missed') return;
      await save(prompt.attemptId, rating);
    },

    async retrySave() {
      const prompt = currentPrompt();
      if (prompt?.save.status !== 'failed') return;
      const { rating, attemptedAt, timeZone } = prompt.save;
      await save(prompt.attemptId, rating, attemptedAt, timeZone);
    },

    async next() {
      if (state.screen !== 'study') return;
      const { session, locale } = state;
      if (session.prompt.save.status !== 'saved' || session.finishing) return;
      const position = session.position + 1;
      if (position < session.queue.length) {
        return set({ ...state, session: { ...session, position, prompt: present(session.queue[position]) } });
      }
      set({ ...state, session: { ...session, finishing: true } });
      let today: TodayView | null = null;
      try {
        today = await loadView();
      } catch {
        today = null;
      }
      set({ screen: 'summary', locale, summary: summarize(session.saved, today) });
    },

    async leave() {
      if (state.screen !== 'study') return;
      const { session } = state;
      if (session.prompt.save.status === 'saving' || session.finishing) return;
      await backToToday(null);
    },

    async closeSummary() {
      if (state.screen === 'summary') await backToToday(null);
    },

    async dispose() {
      listeners.clear();
      await storage?.close();
      storage = null;
    },
  };
}
