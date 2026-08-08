/**
 * 영문 자판(두벌식)으로 입력된 글자를 한글로 되돌린다.
 *
 * 브라우저에는 IME(한/영 상태)를 강제로 켜는 표준 API가 없다.
 * 전화번호(inputMode="tel")·수량(inputMode="numeric") 칸에 들어가는 순간
 * 크롬이 IME를 영문으로 내려버리고, 그대로 한글 칸으로 넘어오면 영문이 찍힌다.
 * 그래서 "막는" 대신 "되돌린다" — 한글 칸에 영문이 들어오면 두벌식 매핑으로 조합해 준다.
 *
 * 이미 한글인 글자는 그대로 유지된다(idempotent). 숫자·공백·기호도 그대로 통과한다.
 */

const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ']
const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']

const HANGUL_BASE = 0xac00
const HANGUL_LAST = 0xd7a3

/** 두벌식 표준 자판 매핑 */
const QWERTY_TO_JAMO: Record<string, string> = {
  q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
  a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
  z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
  Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', Y: 'ㅛ', U: 'ㅕ', I: 'ㅑ', O: 'ㅒ', P: 'ㅖ',
  A: 'ㅁ', S: 'ㄴ', D: 'ㅇ', F: 'ㄹ', G: 'ㅎ', H: 'ㅗ', J: 'ㅓ', K: 'ㅏ', L: 'ㅣ',
  Z: 'ㅋ', X: 'ㅌ', C: 'ㅊ', V: 'ㅍ', B: 'ㅠ', N: 'ㅜ', M: 'ㅡ',
}

/** 복합 중성: ㅗ+ㅏ=ㅘ */
const JUNG_COMBINE: Record<string, string> = {
  'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ',
  'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ',
  'ㅡㅣ': 'ㅢ',
}

/** 겹받침: ㄱ+ㅅ=ㄳ */
const JONG_COMBINE: Record<string, string> = {
  'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ',
  'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ',
  'ㅂㅅ': 'ㅄ',
}

/** 겹받침 분리 — 뒤 자음이 다음 글자 초성으로 넘어갈 때 사용 */
const JONG_SPLIT: Record<string, [string, string]> = {
  'ㄳ': ['ㄱ', 'ㅅ'], 'ㄵ': ['ㄴ', 'ㅈ'], 'ㄶ': ['ㄴ', 'ㅎ'],
  'ㄺ': ['ㄹ', 'ㄱ'], 'ㄻ': ['ㄹ', 'ㅁ'], 'ㄼ': ['ㄹ', 'ㅂ'], 'ㄽ': ['ㄹ', 'ㅅ'],
  'ㄾ': ['ㄹ', 'ㅌ'], 'ㄿ': ['ㄹ', 'ㅍ'], 'ㅀ': ['ㄹ', 'ㅎ'],
  'ㅄ': ['ㅂ', 'ㅅ'],
}

const isVowel = (j: string) => JUNG.indexOf(j) >= 0
const isConsonant = (j: string) => CHO.indexOf(j) >= 0 || JONG.indexOf(j) > 0
const canBeJong = (j: string) => JONG.indexOf(j) > 0
const canBeCho = (j: string) => CHO.indexOf(j) >= 0

/** 완성형 음절을 초·중·종 자모로 분해한다. 복합 모음·겹받침은 통째로 유지한다. */
function decompose(text: string): string[] {
  const out: string[] = []
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      const idx = code - HANGUL_BASE
      out.push(CHO[Math.floor(idx / 588)])
      out.push(JUNG[Math.floor((idx % 588) / 28)])
      const jong = JONG[idx % 28]
      if (jong) out.push(jong)
    } else {
      out.push(ch)
    }
  }
  return out
}

/** 자모 배열을 완성형 한글로 조합한다. 조합 불가한 문자는 그대로 흘린다. */
function compose(jamos: string[]): string {
  let out = ''
  let cho = ''
  let jung = ''
  let jong = ''

  const emit = () => {
    if (cho && jung) {
      out += String.fromCharCode(
        HANGUL_BASE + CHO.indexOf(cho) * 588 + JUNG.indexOf(jung) * 28 + JONG.indexOf(jong),
      )
    } else {
      out += cho + jung + jong
    }
    cho = ''
    jung = ''
    jong = ''
  }

  for (const j of jamos) {
    // 한글 자모가 아닌 문자(숫자·공백·기호)는 조합을 끊고 그대로 통과
    if (!isVowel(j) && !isConsonant(j)) {
      emit()
      out += j
      continue
    }

    if (isVowel(j)) {
      if (jong) {
        // 받침이 다음 글자의 초성으로 넘어간다: 간+ㅏ → 가나
        const split = JONG_SPLIT[jong]
        const moved = split ? split[1] : jong
        jong = split ? split[0] : ''
        emit()
        cho = moved
        jung = j
        continue
      }
      if (jung) {
        const combined = JUNG_COMBINE[jung + j]
        if (combined) {
          jung = combined
          continue
        }
        emit()
        jung = j
        continue
      }
      jung = j
      continue
    }

    // 자음
    if (jung) {
      if (!jong) {
        if (canBeJong(j)) {
          jong = j
          continue
        }
        emit()
        cho = j
        continue
      }
      const combined = JONG_COMBINE[jong + j]
      if (combined) {
        jong = combined
        continue
      }
      emit()
      cho = canBeCho(j) ? j : ''
      if (!cho) out += j
      continue
    }

    if (cho) {
      emit()
      cho = canBeCho(j) ? j : ''
      if (!cho) out += j
      continue
    }
    if (canBeCho(j)) {
      cho = j
    } else {
      emit()
      out += j
    }
  }

  emit()
  return out
}

/** 문자열에 영문 알파벳이 섞여 있는가 */
export function hasLatinLetter(text: string): boolean {
  return /[A-Za-z]/.test(text)
}

/**
 * 영문 자판으로 친 글자를 한글로 변환한다.
 * 한글·숫자·기호는 그대로 두므로 이미 올바른 값에는 영향이 없다.
 *
 *   latinToHangul('rlaeoal')      → '김대미'
 *   latinToHangul('rhkdwnepfh 142') → '광주대로 142'
 */
export function latinToHangul(text: string): string {
  if (!text) return text
  const jamos = decompose(text).map((ch) => QWERTY_TO_JAMO[ch] ?? ch)
  return compose(jamos)
}
