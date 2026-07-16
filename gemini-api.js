/**
 * Gemini API 통신 모듈
 */

const GEMINI_MODEL = "gemini-3.5-flash";

/**
 * Gemini API를 호출하여 여행 코스 데이터를 생성합니다.
 * @param {string} apiKey - 사용자의 Gemini API Key
 * @param {object} params - 검색 조건 (departure, destination, duration, companion, kidsCount, kidsAges)
 * @returns {Promise<object>} 생성된 여행 일정 JSON 데이터
 */
async function generateItinerary(apiKey, params) {
  // 사용 가능한 모델 풀 (특정 모델에 트래픽이 몰려 과부하 발생 시 자동으로 다음 모델 시도)
  const models = ["gemini-3.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
  let lastError = null;

  for (const model of models) {
    try {
      console.log(`[AI] ${model} 모델 호출 시도...`);
      const result = await callGeminiAPI(apiKey, model, params);
      console.log(`[AI] ${model} 모델 호출 성공!`);
      return result;
    } catch (error) {
      console.warn(`[AI] ${model} 모델 실패: ${error.message}`);
      lastError = error;

      // API Key 자체가 만료되었거나 잘못된 경우 등은 다음 모델을 불러도 소용없으므로 바로 에러 리턴
      if (error.message.includes("API key not valid") || 
          error.message.includes("API_KEY_INVALID") || 
          error.message.includes("API key")) {
        throw error;
      }
    }
  }

  // 모든 모델이 실패한 경우 마지막에 발생한 에러를 전송
  throw lastError || new Error("모든 AI 모델 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.");
}

/**
 * 단일 Gemini 모델에 실제 API 요청을 보냅니다.
 */
async function callGeminiAPI(apiKey, model, params) {
  // OAuth Access Token인지 API Key인지 자동 판별
  // OAuth 토큰은 'ya29.'로 시작하며 길이가 훨씬 김
  const isOAuthToken = apiKey && apiKey.startsWith('ya29.');
  
  const url = isOAuthToken
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const prompt = createPrompt(params);

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25초 타임아웃 설정

  try {
    const headers = { "Content-Type": "application/json" };
    if (isOAuthToken) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "API 호출 중 오류가 발생했습니다.");
    }

    const data = await response.json();
    
    // 안전한 데이터 추출 및 검증
    if (!data.candidates || data.candidates.length === 0 || 
        !data.candidates[0].content || 
        !data.candidates[0].content.parts || 
        data.candidates[0].content.parts.length === 0) {
      throw new Error("AI가 유효한 일정을 생성하지 못했습니다. (안전 필터 작동 등)");
    }

    const resultText = data.candidates[0].content.parts[0].text;
    
    // JSON 파싱 검증 및 반환
    return JSON.parse(cleanJsonText(resultText));
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * AI 응답 텍스트에 포함되어 있을 수 있는 마크다운 코드 블록 등을 안전하게 제거합니다.
 */
function cleanJsonText(text) {
  let cleaned = text.trim();
  // 마크다운 코드 블록 제거 (```json ... ``` 또는 ``` ... ```)
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  }
  return cleaned;
}

/**
 * 검색 파라미터를 기반으로 AI 프롬프트를 생성합니다.
 */
function createPrompt(params) {
  const { departure, destination, duration, companion, kidsCount, kidsAges } = params;

  let companionText = "";
  if (companion === "family") {
    companionText = `동반자 유형: 아이들과 함께 가는 가족 여행 (자녀 수: ${kidsCount}명, 자녀 연령대: ${kidsAges.join(", ")})`;
  } else if (companion === "friends") {
    companionText = "동반자 유형: 친구들과 함께하는 여행";
  } else if (companion === "couple") {
    companionText = "동반자 유형: 연인과 함께하는 여행";
  } else if (companion === "colleagues") {
    companionText = "동반자 유형: 직장 동료들과 함께하는 여행/워크숍";
  } else {
    companionText = "동반자 유형: 나홀로 여행 (1인)";
  }

  return `
당신은 대한민국 최고의 맞춤형 여행 설계사 및 로컬 여행 전문가입니다.
다음 조건에 부합하는 완벽한 맞춤형 여행 일정 및 정보(맛집, 교통편, 숙소, 할인 꿀팁)를 한국어로 작성하여 JSON 형식으로만 반환해 주세요.

## 여행 조건
1. 출발지: ${departure} (출발지를 고려하여 교통편과 이동 시간, 동선을 최적화해 주세요.)
2. 목적지: ${destination} (국내 또는 국외)
3. 여행 기간: ${duration}
4. ${companionText}

## 요구사항 및 규칙:
1. **교통편 (transportation)**:
   - 출발지(${departure})에서 목적지(${destination})까지 이동하는 가장 빠르고 편리한 방법(KTX, SRT, 자차, 고속버스, 항공편 등)을 설명해 주세요.
   - 자녀가 있는 경우(특히 영유아/유아) 장시간 이동 시의 피로도를 고려한 실용적인 이동 팁과 예약 사이트 바로가기 정보(레츠코레일, 스카이스캐너 등)를 포함해 주세요.
2. **동선 및 일정 (itinerary)**:
   - 여행 기간에 맞춰 일자별(Day 1, Day 2 등) 시간대별 상세 이동 동선을 짜 주세요.
   - 동반자 유형에 딱 맞춘 추천 관광지를 제안해 주세요. (예: 영유아 동반 시 유모차 이동이 수월하고 실내 수유실이 잘 구비된 곳, 초등학생 자녀 동반 시 체험형 학습이 가능한 곳, 친구 동반 시 인스타 감성 핫플레이스 및 액티비티 등).
   - 각 관광지마다 왜 이 연령대/동반자 유형에 추천하는지 구체적인 이유(팁)를 포함해 주세요.
3. **맛집 (restaurants)**:
   - 동선 흐름에 자연스럽게 녹아드는 Curated 맛집을 일자별 또는 추천 목록으로 제공해 주세요.
   - 식당 이름, 대표 메뉴, 그리고 동반자 맞춤 추천 이유(예: "아기의자가 구비되어 있음", "어린이 메뉴 보유", "넓은 테이블로 단체 식사 가능", "연인들이 선호하는 뷰맛집")를 명시해 주세요.
4. **숙소 추천 (accommodations)**:
   - 동반자 유형에 특화된 숙소를 2~3곳 추천해 주세요. (예: 키즈 풀빌라/리조트, 감성 독채 펜션, 럭셔리 호텔, 가성비 호텔 등).
   - 숙소명, 추천 유형, 평점(예: 4.7/5), 숙소 설명, 그리고 아고다(Agoda)나 야놀자(Yanolja), 부킹닷컴(Booking.com) 등에서 해당 숙소명을 바로 검색할 수 있는 형태의 동적 URL 또는 검색 딥링크 예시를 만들어 주세요.
5. **할인 정보 및 꿀팁 (discounts)**:
   - 해당 조건에서 받을 수 있는 실질적인 할인 혜택을 2~3개 알려주세요. (예: KTX 다자녀 30% 할인, 36개월 미만 무료 입장, 항공사 키즈 할인 서비스, 제휴 카드 할인 정보, 지역 여행 패스 등).

## 출력 JSON 스키마:
반드시 다음 구조의 JSON 객체여야 하며, 추가적인 설명 텍스트 없이 순수 JSON만 반환해 주세요.

{
  "destination": "목적지 이름 (예: 제주, 경주 등)",
  "duration": "여행 기간",
  "suitability": "이 동반자/연령대에게 이 여행지가 좋은 이유 요약 (2-3문장)",
  "transportation": {
    "method": "추천 이동 수단 (예: KTX + 렌터카)",
    "duration_desc": "출발지로부터의 예상 소요 시간 및 총평",
    "details": "출발지를 감안한 구체적인 교통편 이용 가이드",
    "booking_links": [
      {
        "name": "예약/안내 사이트명 (예: 레츠코레일, 스카이스캐너)",
        "url": "이동할 공식 URL"
      }
    ]
  },
  "itinerary": [
    {
      "day": 1,
      "routes": [
        {
          "time": "시간대 (예: 10:00 또는 오전)",
          "title": "방문 장소명 또는 활동명",
          "description": "상세 활동 내용 및 동선 안내",
          "type": "attraction", // attraction, restaurant, transport, hotel 중 하나
          "tip": "동반자 유형에 맞춘 유용한 팁 (예: 유모차 대여 가능, 역사 퀴즈 맞추기 좋음)"
        }
      ]
    }
  ],
  "restaurants": [
    {
      "name": "식당명",
      "menu": "대표 메뉴",
      "reason": "추천 이유 및 키즈/동반자 프렌들리 요소",
      "location": "대략적인 위치 또는 매칭 일정 (예: Day 1 점심)"
    }
  ],
  "accommodations": [
    {
      "name": "숙소명",
      "type": "숙소 구분 (예: 키즈 리조트, 감성 펜션)",
      "rating": "평점 (예: 4.8/5)",
      "description": "숙소에 대한 구체적인 추천 사유와 특징",
      "booking_link": "아고다, 야놀자 등의 검색 딥링크 URL"
    }
  ],
  "discounts": [
    {
      "title": "할인 혜택명",
      "description": "조건 및 상세 혜택 내용 설명"
    }
  ]
}
`;
}

