export const QUESTIONS = [
  {
    id: 'equipment',
    text: 'Тебе выдали всё необходимое для работы (форма, пропуск, доступы)?',
    short: 'Выдали всё необходимое',
  },
  {
    id: 'mentor',
    text: 'Есть человек, к которому можно обратиться с вопросом?',
    short: 'Есть к кому обратиться',
  },
  {
    id: 'expectations',
    text: 'Работа и график совпадают с тем, что обещали на собеседовании?',
    short: 'Работа совпадает с обещанным',
  },
  {
    id: 'salary',
    text: 'Тебе понятно, сколько и когда ты получишь зарплату?',
    short: 'Понятно про зарплату',
  },
];

export const ANSWERS = {
  yes: { label: 'Да', weight: 1 },
  no: { label: 'Нет', weight: 0 },
  idk: { label: 'Не знаю', weight: 0.3 },
};

export const PASS_THRESHOLD = 80;
export const HR_ESCALATION_FAILS = 2;

const QUESTION_WEIGHT = 100 / QUESTIONS.length;

export function scoreSurvey(answers) {
  let score = 0;
  let hasNo = false;
  for (const q of QUESTIONS) {
    const answer = answers?.[q.id];
    if (!Object.hasOwn(ANSWERS, answer ?? '')) {
      throw new Error(`Нет ответа на вопрос «${q.short}»`);
    }
    score += QUESTION_WEIGHT * ANSWERS[answer].weight;
    if (answer === 'no') hasNo = true;
  }
  score = Math.round(score * 10) / 10;
  return { score, failed: hasNo || score < PASS_THRESHOLD };
}
