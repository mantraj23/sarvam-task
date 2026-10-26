export const questionTypes = { open: "Open-ended", choice: "Multiple choice", csat: "CSAT rating" };

export function validateSurvey(survey) {
  if (typeof survey.title !== "string" || !survey.title.trim() || survey.title.length > 100) return "Add a survey name (up to 100 characters).";
  if (!Array.isArray(survey.questions) || survey.questions.length < 2 || survey.questions.length > 3) return "Add two or three questions to your survey.";
  const ids = new Set();
  for (const [index, question] of survey.questions.entries()) {
    if (typeof question?.id !== "string" || !question.id || ids.has(question.id)) return "Each question needs a unique ID.";
    ids.add(question.id);
    if (!Object.hasOwn(questionTypes, question.type)) return `Choose a type for question ${index + 1}.`;
    if (typeof question.prompt !== "string" || !question.prompt.trim() || question.prompt.length > 500) return `Write question ${index + 1} (up to 500 characters).`;
    if (question.type === "choice") {
      if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 6) return `Add 2–6 options to question ${index + 1}.`;
      if (question.options.some((option) => typeof option !== "string" || !option.trim() || option.length > 60)) return `Complete all options for question ${index + 1} (up to 60 characters each).`;
      if (new Set(question.options.map((option) => option.trim().toLocaleLowerCase())).size !== question.options.length) return `Use different options for question ${index + 1}.`;
    }
  }
  return "";
}

export function validateAnswer(question, value) {
  if (question.type === "open") return typeof value === "string" && value.trim().length > 0 && value.length <= 5000;
  if (question.type === "csat") return Number.isInteger(value) && value >= 1 && value <= 5;
  return Number.isInteger(value) && value >= 0 && value < question.options.length;
}

export function answerLabel(question, value) {
  if (question.type === "csat") return `${value} / 5`;
  if (question.type === "choice") return question.options[value];
  return value;
}

export function inferAnswer(question, transcript) {
  if (question.type === "open") return transcript.trim();
  let text = transcript.trim().normalize("NFKC").toLocaleLowerCase().replace(/[.!।。]+$/u, "").trim();
  const digitSets = ["०१२३४५६७८९", "০১২৩৪৫৬৭৮৯", "૦૧૨૩૪૫૬૭૮૯", "೦೧೨೩೪೫೬೭೮೯", "൦൧൨൩൪൫൬൭൮൯", "୦୧୨୩୪୫୬୭୮୯", "੦੧੨੩੪੫੬੭੮੯", "௦௧௨௩௪௫௬௭௮௯", "౦౧౨౩౪౫౬౭౮౯"];
  for (const digits of digitSets) text = [...text].map((char) => digits.includes(char) ? String(digits.indexOf(char)) : char).join("");
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5 };
  const number = /^\d$/.test(text) ? Number(text) : words[text];
  if (question.type === "csat") return number >= 1 && number <= 5 ? number : null;
  const exact = question.options.findIndex((option) => option.trim().toLocaleLowerCase() === text);
  if (exact >= 0) return exact;
  return number >= 1 && number <= question.options.length ? number - 1 : null;
}

const scaleHints = {
  "en-IN": "Please rate from one to five. One means very dissatisfied, and five means very satisfied.",
  "hi-IN": "कृपया एक से पाँच तक अंक दें। एक का अर्थ बहुत असंतुष्ट और पाँच का अर्थ बहुत संतुष्ट है।",
  "bn-IN": "অনুগ্রহ করে এক থেকে পাঁচের মধ্যে নম্বর দিন। এক মানে খুব অসন্তুষ্ট এবং পাঁচ মানে খুব সন্তুষ্ট।",
  "gu-IN": "કૃપા કરીને એકથી પાંચ સુધી ગુણ આપો. એક એટલે ખૂબ અસંતુષ્ટ અને પાંચ એટલે ખૂબ સંતુષ્ટ.",
  "kn-IN": "ದಯವಿಟ್ಟು ಒಂದರಿಂದ ಐದರ ನಡುವೆ ಅಂಕ ನೀಡಿ. ಒಂದು ಎಂದರೆ ತುಂಬಾ ಅತೃಪ್ತಿ ಮತ್ತು ಐದು ಎಂದರೆ ತುಂಬಾ ತೃಪ್ತಿ.",
  "ml-IN": "ഒന്ന് മുതൽ അഞ്ച് വരെ മാർക്ക് നൽകുക. ഒന്ന് വളരെ അസംതൃപ്തിയെയും അഞ്ച് വളരെ സംതൃപ്തിയെയും സൂചിപ്പിക്കുന്നു.",
  "mr-IN": "कृपया एक ते पाच गुण द्या. एक म्हणजे खूप असमाधानी आणि पाच म्हणजे खूप समाधानी.",
  "od-IN": "ଦୟାକରି ଏକରୁ ପାଞ୍ଚ ପର୍ଯ୍ୟନ୍ତ ନମ୍ବର ଦିଅନ୍ତୁ। ଏକ ଅର୍ଥ ବହୁତ ଅସନ୍ତୁଷ୍ଟ ଏବଂ ପାଞ୍ଚ ଅର୍ଥ ବହୁତ ସନ୍ତୁଷ୍ଟ।",
  "pa-IN": "ਕਿਰਪਾ ਕਰਕੇ ਇੱਕ ਤੋਂ ਪੰਜ ਤੱਕ ਅੰਕ ਦਿਓ। ਇੱਕ ਦਾ ਮਤਲਬ ਬਹੁਤ ਅਸੰਤੁਸ਼ਟ ਅਤੇ ਪੰਜ ਦਾ ਮਤਲਬ ਬਹੁਤ ਸੰਤੁਸ਼ਟ ਹੈ।",
  "ta-IN": "ஒன்று முதல் ஐந்து வரை மதிப்பிடவும். ஒன்று மிகவும் அதிருப்தி, ஐந்து மிகவும் திருப்தி என்பதைக் குறிக்கிறது.",
  "te-IN": "దయచేసి ఒకటి నుండి ఐదు వరకు రేటింగ్ ఇవ్వండి. ఒకటి అంటే చాలా అసంతృప్తి, ఐదు అంటే చాలా సంతృప్తి.",
};

export function spokenQuestion(question, language) {
  if (question.type === "csat") return `${question.prompt} ${scaleHints[language] || scaleHints["en-IN"]}`;
  if (question.type === "choice") return `${question.prompt} ${question.options.map((option, i) => `${i + 1}. ${option}.`).join(" ")}`;
  return question.prompt;
}

const languageScripts = {
  "en-IN": /\p{Script=Latin}/u,
  "hi-IN": /\p{Script=Devanagari}/u, "mr-IN": /\p{Script=Devanagari}/u,
  "bn-IN": /\p{Script=Bengali}/u, "gu-IN": /\p{Script=Gujarati}/u,
  "kn-IN": /\p{Script=Kannada}/u, "ml-IN": /\p{Script=Malayalam}/u,
  "od-IN": /\p{Script=Oriya}/u, "pa-IN": /\p{Script=Gurmukhi}/u,
  "ta-IN": /\p{Script=Tamil}/u, "te-IN": /\p{Script=Telugu}/u,
};

export function validateTranslation(original, translated, language) {
  if (!Array.isArray(translated) || translated.length !== original.length) throw new Error("The translated survey is incomplete. Please retry.");
  return original.map((question, index) => {
    const item = translated[index];
    if (!item || typeof item.prompt !== "string" || !item.prompt.trim() || item.prompt.length > 500) throw new Error("A translated question is invalid. Please retry.");
    if (languageScripts[language] && !languageScripts[language].test(item.prompt)) throw new Error("A question was not translated into the selected language. Please retry translation.");
    const result = { ...question, prompt: item.prompt.trim() };
    if (question.type === "choice") {
      if (!Array.isArray(item.options) || item.options.length !== question.options.length || item.options.some((option) => typeof option !== "string" || !option.trim() || option.length > 60)) throw new Error("Translated options are incomplete. Please retry.");
      if (new Set(item.options.map((option) => option.trim().toLocaleLowerCase())).size !== item.options.length) throw new Error("Translated choices are ambiguous. Please retry.");
      result.options = item.options.map((option) => option.trim());
    }
    return result;
  });
}
