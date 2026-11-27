import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Alert, AppState, Button, Pressable, ScrollView, StatusBar, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { openDatabaseAsync } from 'expo-sqlite';
import { Storage as preferences } from 'expo-sqlite/kv-store';
import fixtureDeck from './src/content/fixtures/deck.json';
import { localizeFixtureCard } from './src/content/fixture-locales';
import { NEW_CARD_LIMITS, openStorage, type NewCardLimit } from './src/storage/storage.ts';
import { deckTopics, parseFixtureDeck, textIn } from './src/study/content.ts';
import { createStudy, type Notice, type Session, type StudyController, type StudyState } from './src/study/controller.ts';
import { COPY, formatDueDate, LOCALE_NAMES, LOCALES, type Copy, type StudyLocale } from './src/study/copy.ts';

// Low-fidelity prototype for usability validation: default controls, no production styling.
// Public fixture deck only; rated attempts are stored in SQLite on the device.
const deck = parseFixtureDeck(fixtureDeck);
const topics = deckTopics(deck);

const Lang = createContext<StudyLocale>('en');
const StudyContext = createContext<StudyController | null>(null);

const useStudy = () => useContext(StudyContext)!;
const useCopy = (): Copy => COPY[useContext(Lang)];

export default function App() {
  const [study] = useState(() =>
    createStudy({
      openStorage: () => openStorage(openDatabaseAsync, 'recall.db'),
      preferences,
      deck,
      localize: localizeFixtureCard,
    }),
  );
  const state = useSyncExternalStore(study.subscribe, study.getState);

  useEffect(() => {
    void study.init();
    // Eligibility changes at local midnight; Today refreshes whenever the app returns to the foreground.
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void study.refresh();
    });
    return () => subscription.remove();
  }, [study]);

  return (
    <StudyContext.Provider value={study}>
      <Lang.Provider value={state.locale}>
        <SafeAreaProvider>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <StatusBar barStyle="dark-content" />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 16 }}>
              <Header />
              <Screen state={state} />
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Lang.Provider>
    </StudyContext.Provider>
  );
}

function Header() {
  const copy = useCopy();
  return (
    <View>
      <Body>{copy.appName}</Body>
      <Body>{copy.prototypeLabel}</Body>
    </View>
  );
}

function Screen({ state }: { state: StudyState }) {
  const copy = useCopy();
  switch (state.screen) {
    case 'loading':
      return <Body>{copy.loading}</Body>;
    case 'unavailable':
      return (
        <>
          <Body>{state.problem === 'storage' ? copy.storageUnavailable : copy.contentUnavailable}</Body>
          {state.problem === 'content' && <LanguagePicker />}
        </>
      );
    case 'onboarding':
      return <Onboarding notice={state.notice} newCardLimit={state.today.newCardLimit} />;
    case 'today':
      return <Today state={state} />;
    case 'study':
      return <StudyCard session={state.session} />;
    case 'summary':
      return <SessionSummary state={state} />;
  }
}

function Onboarding({ notice, newCardLimit }: { notice: Notice | null; newCardLimit: NewCardLimit }) {
  const copy = useCopy();
  const study = useStudy();
  return (
    <>
      <Title>{copy.onboardingTitle}</Title>
      <Body>{copy.onboardingPurpose}</Body>
      <Heading>{copy.topicsHeading}</Heading>
      {topics.map((topic) => (
        <Body key={topic}>• {copy.topics[topic]}</Body>
      ))}
      <Heading>{copy.rulesHeading}</Heading>
      {copy.rules(newCardLimit).map((rule) => (
        <Body key={rule}>• {rule}</Body>
      ))}
      <LanguagePicker />
      {notice && <Body>{copy.notices[notice]}</Body>}
      <Action title={copy.continue} onPress={() => void study.finishOnboarding()} />
    </>
  );
}

function Today({ state }: { state: Extract<StudyState, { screen: 'today' }> }) {
  const copy = useCopy();
  const study = useStudy();
  const { today, starting } = state;
  const busy = starting || state.savingLimit;
  return (
    <>
      <Title>{copy.todayTitle}</Title>
      <Body>{copy.track}</Body>
      <Body>{copy.dueCount(today.due)}</Body>
      <Body>{copy.newCount(today.new)}</Body>
      {state.notice && <Body>{copy.notices[state.notice]}</Body>}
      {today.status === 'empty' && <Body>{copy.emptyDeck}</Body>}
      {today.status === 'caught-up' && (
        <>
          <Body>{copy.caughtUp}</Body>
          <Body>
            {today.nextDueDate
              ? copy.nextReview(formatDueDate(today.nextDueDate, today.date, state.locale))
              : copy.noReviewScheduled}
          </Body>
        </>
      )}
      {today.status === 'ready' && (
        <>
          <Body>{copy.draftsRule}</Body>
          <Action title={copy.startReview} disabled={busy} onPress={() => void study.start()} />
          {starting && <Body>{copy.starting}</Body>}
        </>
      )}
      <Heading>{copy.settings}</Heading>
      <LanguagePicker disabled={busy} />
      <NewCardLimitPicker current={today.newCardLimit} disabled={busy} />
      <Action title={copy.howItWorks} disabled={busy} onPress={() => study.showOnboarding()} />
    </>
  );
}

function StudyCard({ session }: { session: Session }) {
  const copy = useCopy();
  const lang = useContext(Lang);
  const study = useStudy();
  const { prompt } = session;
  const { card } = prompt;

  function confirmLeave() {
    Alert.alert(copy.leaveTitle, copy.leaveBody, [
      { text: copy.cancel, style: 'cancel' },
      { text: copy.leaveConfirm, style: 'destructive', onPress: () => void study.leave() },
    ]);
  }

  return (
    <>
      <Body>
        {copy.progress(session.position + 1, session.queue.length)} · {copy.topics[card.topic]} ·{' '}
        {copy.kind[prompt.item.kind]}
      </Body>
      <Title>{textIn(card.prompt, lang)}</Title>
      {prompt.stage === 'answering' ? <Answering session={session} /> : <Feedback session={session} />}
      <Action
        title={copy.leaveSession}
        disabled={prompt.save.status === 'saving' || session.finishing}
        onPress={confirmLeave}
      />
    </>
  );
}

function Answering({ session }: { session: Session }) {
  const copy = useCopy();
  const lang = useContext(Lang);
  const study = useStudy();
  const { prompt } = session;
  const { card } = prompt;
  return (
    <>
      {card.type === 'open' ? (
        <>
          <Body>{copy.openInstructions}</Body>
          <Body>{copy.draftDisclosure}</Body>
          <TextInput
            accessibilityLabel={copy.answerLabel}
            accessibilityLanguage={lang}
            placeholder={copy.answerLabel}
            multiline
            value={prompt.draft}
            onChangeText={(text) => study.setDraft(text)}
            style={{ borderWidth: 1, padding: 12, minHeight: 72 }}
          />
        </>
      ) : (
        <>
          <Body>{copy.choiceInstructions}</Body>
          {card.choices.map((choice) => {
            const selected = prompt.selectedChoice === choice.id;
            // Selecting only marks the option; the answer is graded on Submit.
            return (
              <Pressable
                key={choice.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLanguage={lang}
                onPress={() => study.selectChoice(choice.id)}
                style={{ borderWidth: 1, padding: 12 }}
              >
                <Body>
                  {selected ? '● ' : '○ '}
                  {textIn(choice.text, lang)}
                  {selected ? ` (${copy.choiceSelected})` : ''}
                </Body>
              </Pressable>
            );
          })}
        </>
      )}
      <Action
        title={copy.submit}
        disabled={card.type === 'multiple-choice' && prompt.selectedChoice === null}
        onPress={() => void study.submit()}
      />
      <Action title={copy.dontKnow} onPress={() => void study.dontKnow()} />
    </>
  );
}

function Feedback({ session }: { session: Session }) {
  const copy = useCopy();
  const lang = useContext(Lang);
  const { prompt } = session;
  const { card } = prompt;
  return (
    <>
      <Heading>{copy.feedbackTitle}</Heading>
      {card.type === 'open' ? (
        <>
          <Body>
            {copy.yourAnswer}: {prompt.draft.trim() ? prompt.draft : copy.noWrittenAnswer}
          </Body>
          {prompt.gaveUp && <Body>{copy.gaveUp}</Body>}
          <Heading>{copy.reference}</Heading>
          <Body>{textIn(card.reference, lang)}</Body>
          <Heading>{copy.checklist}</Heading>
          {card.checklist.map((item) => (
            <Body key={item.id}>
              • {item.required ? copy.required : copy.optional}: {textIn(item.text, lang)}
            </Body>
          ))}
        </>
      ) : (
        <>
          <Body>
            {prompt.gaveUp
              ? copy.choiceGaveUp
              : prompt.selectedChoice === card.answer
                ? copy.choiceCorrect
                : copy.choiceWrong}
          </Body>
          {card.choices.map((choice) => (
            <View key={choice.id}>
              <Body>
                • {textIn(choice.text, lang)}
                {choice.id === card.answer ? ` — ${copy.correctChoice}` : ''}
                {choice.id === prompt.selectedChoice ? ` — ${copy.yourChoice}` : ''}
              </Body>
              {choice.id !== card.answer && (
                <Body>
                  {copy.whyWrong}: {textIn(choice.reason, lang)}
                </Body>
              )}
            </View>
          ))}
        </>
      )}
      <Heading>{copy.explanation}</Heading>
      <Body>{textIn(card.explanation, lang)}</Body>
      <SaveStatus session={session} />
    </>
  );
}

function SaveStatus({ session }: { session: Session }) {
  const copy = useCopy();
  const lang = useContext(Lang);
  const study = useStudy();
  const { prompt } = session;
  const { save } = prompt;
  switch (save.status) {
    case 'idle':
      return (
        <>
          <Heading>{copy.rateHeading}</Heading>
          <Body>{prompt.gaveUp ? copy.gaveUpRule : copy.rateRule}</Body>
          {(prompt.gaveUp ? (['missed'] as const) : (['correct', 'partial', 'missed'] as const)).map((rating) => (
            <Action key={rating} title={copy.ratings[rating]} onPress={() => void study.rate(rating)} />
          ))}
        </>
      );
    case 'saving':
      return <Body>{copy.saving}</Body>;
    case 'failed':
      return (
        <>
          <Body>{save.reason === 'busy' ? copy.saveBusy : copy.saveFailed}</Body>
          <Action title={copy.retrySave} onPress={() => void study.retrySave()} />
        </>
      );
    case 'saved': {
      const { attempt } = save;
      const last = session.position + 1 === session.queue.length;
      return (
        <>
          <Body>{copy.saved(copy.ratings[attempt.rating], formatDueDate(attempt.dueDate, attempt.civilDate, lang))}</Body>
          <Action
            title={last ? copy.seeSummary : copy.nextQuestion}
            disabled={session.finishing}
            onPress={() => void study.next()}
          />
        </>
      );
    }
  }
}

function SessionSummary({ state }: { state: Extract<StudyState, { screen: 'summary' }> }) {
  const copy = useCopy();
  const study = useStudy();
  const { summary, locale } = state;
  return (
    <>
      <Title>{copy.summaryTitle}</Title>
      <Body>
        {copy.summaryCounts(summary.answered, summary.ratings.correct, summary.ratings.partial, summary.ratings.missed)}
      </Body>
      <Body>
        {summary.nextReview
          ? copy.nextReview(formatDueDate(summary.nextReview, summary.today, locale))
          : copy.noReviewScheduled}
      </Body>
      <Action title={copy.backToToday} onPress={() => void study.closeSummary()} />
    </>
  );
}

function LanguagePicker({ disabled = false }: { disabled?: boolean }) {
  const copy = useCopy();
  const current = useContext(Lang);
  const study = useStudy();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={copy.language} accessibilityLanguage={current}>
      <Heading>{copy.language}</Heading>
      {LOCALES.map((locale) => (
        // Each language is named, and read aloud, in that language.
        <Pressable
          key={locale}
          accessibilityRole="radio"
          accessibilityState={{ checked: locale === current, disabled }}
          accessibilityLanguage={locale}
          disabled={disabled}
          onPress={() => void study.chooseLocale(locale)}
          style={{ padding: 8 }}
        >
          <Text accessibilityLanguage={locale}>
            {locale === current ? '● ' : '○ '}
            {LOCALE_NAMES[locale]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function NewCardLimitPicker({ current, disabled }: { current: NewCardLimit; disabled: boolean }) {
  const copy = useCopy();
  const lang = useContext(Lang);
  const study = useStudy();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={copy.newCardLimit} accessibilityLanguage={lang}>
      <Heading>{copy.newCardLimit}</Heading>
      <Body>{copy.newCardLimitHelp}</Body>
      {NEW_CARD_LIMITS.map((limit) => (
        <Pressable
          key={limit}
          accessibilityRole="radio"
          accessibilityLabel={copy.newCardLimitOption(limit)}
          accessibilityState={{ checked: limit === current, disabled }}
          accessibilityLanguage={lang}
          disabled={disabled}
          onPress={() => void study.chooseNewCardLimit(limit)}
          style={{ padding: 8 }}
        >
          <Body>
            {limit === current ? '● ' : '○ '}
            {copy.newCardLimitOption(limit)}
          </Body>
        </Pressable>
      ))}
    </View>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" accessibilityLanguage={useContext(Lang)} style={{ fontSize: 26, fontWeight: '600' }}>
      {children}
    </Text>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" accessibilityLanguage={useContext(Lang)} style={{ fontSize: 20, fontWeight: '600' }}>
      {children}
    </Text>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <Text accessibilityLanguage={useContext(Lang)}>{children}</Text>;
}

function Action({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Button title={title} accessibilityLanguage={useContext(Lang)} disabled={disabled} onPress={onPress} />;
}
