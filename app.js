

// 글로벌 상태 객체
let state = {
  apiKey: '',          // 하위 호환성 유지 (OAuth 사용 시 빈값)
  accessToken: '',     // Google OAuth 2.0 액세스 토큰
  googleUser: null,    // { name, email, picture }
  defaultDeparture: '서울 마포구',
  isDemoMode: true,
  currentPlan: null,
  activeParams: null,
  savedPlans: []
};

// DOM 요소 캐시
const screenWelcome = document.getElementById('screen-welcome');
const mainHeader = document.getElementById('main-header');
const bottomNavbar = document.getElementById('bottom-navbar');
const tabExplore = document.getElementById('tab-explore');
const tabSaved = document.getElementById('tab-saved');
const tabSettings = document.getElementById('tab-settings');

const inputApiKey = null; // Google OAuth로 대체 (하위 호환성 유지용)
const selectWelcomeDeparture = document.getElementById('welcome-departure');
const selectSearchDeparture = document.getElementById('search-departure');
const inputDestination = document.getElementById('search-destination');
const selectDuration = document.getElementById('search-duration');
const selectCompanion = document.getElementById('search-companion');
const childSelector = document.getElementById('child-selector');
const textKidsCount = document.getElementById('kids-count');

const modalApiGuide = document.getElementById('modal-api-guide');

// 초기 로드 시 실행
window.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Google OAuth 토큰 및 사용자 정보 복구
  const savedToken = localStorage.getItem('travel_access_token') || '';
  const savedUser = localStorage.getItem('travel_google_user');
  state.accessToken = savedToken;
  state.googleUser = savedUser ? JSON.parse(savedUser) : null;
  state.apiKey = savedToken; // gemini-api.js 하위 호환용 (Bearer 방식이므로 실제론 토큰으로 사용)
  state.defaultDeparture = localStorage.getItem('travel_default_departure') || '서울 마포구';
  
  const savedPlansRaw = localStorage.getItem('travel_saved_plans');
  state.savedPlans = savedPlansRaw ? JSON.parse(savedPlansRaw) : [];

  const sessionActive = localStorage.getItem('travel_session_active') === 'true';

  // 출발지 선택란들 자동 입력 세팅
  if (selectWelcomeDeparture) selectWelcomeDeparture.value = state.defaultDeparture;
  if (selectSearchDeparture) selectSearchDeparture.value = state.defaultDeparture;
  const settingsDeparture = document.getElementById('settings-default-departure');
  if (settingsDeparture) settingsDeparture.value = state.defaultDeparture;

  // 헤더 출발지 뱃지 갱신
  updateHeaderDepartureTag();

  if (sessionActive) {
    state.isDemoMode = !state.accessToken;
    showMainApp();
  } else {
    showWelcomeScreen();
  }
}

// 웰컴 화면 표시
function showWelcomeScreen() {
  document.body.classList.remove('logged-in');
  screenWelcome.style.display = 'flex';
  mainHeader.style.display = 'none';
  bottomNavbar.style.display = 'none';
  tabExplore.classList.remove('active');
  tabSaved.classList.remove('active');
  tabSettings.classList.remove('active');
}

// 메인 앱 화면 표시
function showMainApp() {
  document.body.classList.add('logged-in');
  screenWelcome.style.display = 'none';
  mainHeader.style.display = 'flex';
  bottomNavbar.style.display = 'flex';
  
  // 기본적으로 탐색 탭 활성화
  switchTab('explore');
  
  // 설정 화면 갱신
  updateSettingsView();
}

// 헤더 출발지 태그 업데이트
function updateHeaderDepartureTag() {
  const tag = document.getElementById('header-departure');
  if (tag) {
    tag.textContent = `${state.defaultDeparture} 출발`;
  }
}

// Google OAuth 2.0 로그인 처리 (GIS Token Model)
const GOOGLE_CLIENT_ID = '782981264995-p95g5rb53nlqb66sbkd676b3vq91mkeh.apps.googleusercontent.com';

function handleGoogleLogin() {
  const departure = (selectWelcomeDeparture ? selectWelcomeDeparture.value.trim() : '') || '서울 마포구';

  // GIS 라이브러리 로드 확인
  if (typeof google === 'undefined' || !google.accounts) {
    alert('Google 로그인 라이브러리가 로드되지 않았습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    return;
  }

  // Access Token 요청 (Implicit/Token 모델)
  const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/generative-language openid profile email',
    callback: async (tokenResponse) => {
      if (tokenResponse.error) {
        console.error('Google 로그인 실패:', tokenResponse.error);
        alert('Google 로그인에 실패했습니다. 다시 시도해 주세요.');
        return;
      }

      const accessToken = tokenResponse.access_token;
      state.accessToken = accessToken;
      state.apiKey = accessToken; // gemini-api.js 하위 호환용

      // Google 사용자 프로필 조회
      try {
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const profile = await profileRes.json();
        state.googleUser = {
          name: profile.name || '사용자',
          email: profile.email || '',
          picture: profile.picture || ''
        };
        localStorage.setItem('travel_google_user', JSON.stringify(state.googleUser));
      } catch (e) {
        state.googleUser = { name: 'Google 사용자', email: '', picture: '' };
      }

      state.defaultDeparture = departure;
      state.isDemoMode = false;

      localStorage.setItem('travel_access_token', accessToken);
      localStorage.setItem('travel_default_departure', departure);
      localStorage.setItem('travel_session_active', 'true');

      if (selectSearchDeparture) selectSearchDeparture.value = departure;
      updateHeaderDepartureTag();
      showMainApp();
    }
  });
  tokenClient.requestAccessToken();
}

// 웰컴 화면 로그인 처리 (구버전 API Key 호환 - 현재 미사용)
function handleLogin() {
  handleGoogleLogin();
}

// 웰컴 화면 데모 모드 로그인 처리
function handleDemoLogin() {
  const departure = selectWelcomeDeparture.value.trim() || '서울 마포구';
  
  state.apiKey = '';
  state.defaultDeparture = departure;
  state.isDemoMode = true;

  localStorage.setItem('travel_api_key', '');
  localStorage.setItem('travel_default_departure', departure);
  localStorage.setItem('travel_session_active', 'true');

  if (selectSearchDeparture) selectSearchDeparture.value = departure;
  updateHeaderDepartureTag();
  showMainApp();
}

// 로그아웃 처리
function handleLogout() {
  if (confirm('설정 및 저장된 정보가 모두 초기화됩니다. 로그아웃 하시가습니까?')) {
    // Google OAuth 토큰 해제
    if (state.accessToken && typeof google !== 'undefined' && google.accounts) {
      google.accounts.oauth2.revoke(state.accessToken, () => {
        console.log('Google 토큰 해제 완료');
      });
    }

    localStorage.removeItem('travel_access_token');
    localStorage.removeItem('travel_google_user');
    localStorage.removeItem('travel_api_key');
    localStorage.removeItem('travel_default_departure');
    localStorage.removeItem('travel_session_active');
    localStorage.removeItem('travel_saved_plans');
    
    state.apiKey = '';
    state.accessToken = '';
    state.googleUser = null;
    state.defaultDeparture = '서울 마포구';
    state.isDemoMode = true;
    state.savedPlans = [];
    state.currentPlan = null;
    state.activeParams = null;

    // 결과창 초기화
    document.getElementById('results-container').classList.remove('active');
    
    showWelcomeScreen();
  }
}

// 탭 전환 핸들러
function switchTab(tabId) {
  // 탭 콘텐츠 활성화 처리
  const contents = document.querySelectorAll('.tab-content');
  contents.forEach(c => c.classList.remove('active'));
  
  const activeContent = document.getElementById(`tab-${tabId}`);
  if (activeContent) activeContent.classList.add('active');

  // 탭 네비게이션 버튼 활성화 처리
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(t => t.classList.remove('active'));

  const activeTab = document.getElementById(`nav-${tabId}`);
  if (activeTab) activeTab.classList.add('active');

  // 보관함 탭 활성화 시 목록 렌더링
  if (tabId === 'saved') {
    renderSavedPlansList();
  }
  
  // 스크롤 상단으로 이동
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 동반자 유형에 따른 자녀 설정 노출 여부 토글
function toggleCompanionDetails(value) {
  if (value === 'family') {
    childSelector.classList.add('active');
  } else {
    childSelector.classList.remove('active');
  }
}

// 자녀 수 카운터 업데이트
function updateCounter(id, delta) {
  const counterEl = document.getElementById(id);
  if (!counterEl) return;

  let val = parseInt(counterEl.textContent);
  val += delta;

  if (val < 1) val = 1;
  if (val > 10) val = 10;

  counterEl.textContent = val;
}

// 퀵 메뉴 검색어 설정
function setQuickSearch(dest) {
  if (inputDestination) {
    inputDestination.value = dest;
    triggerSearch();
  }
}

// 자주 쓰는 출발지 실시간 저장
function saveDefaultDeparture(val) {
  state.defaultDeparture = val;
  localStorage.setItem('travel_default_departure', val);
  updateHeaderDepartureTag();
  const settingsDeparture = document.getElementById('settings-default-departure');
  if (settingsDeparture) settingsDeparture.value = val;
}

// 설정 화면 업데이트
function updateSettingsView() {
  const googleProfile = document.getElementById('settings-google-profile');
  const demoProfile = document.getElementById('settings-demo-profile');
  const settingsDeparture = document.getElementById('settings-default-departure');

  if (settingsDeparture) settingsDeparture.value = state.defaultDeparture;

  if (state.googleUser && !state.isDemoMode) {
    // Google 로그인 상태
    if (googleProfile) googleProfile.style.display = 'block';
    if (demoProfile) demoProfile.style.display = 'none';
    const imgEl = document.getElementById('settings-profile-img');
    const nameEl = document.getElementById('settings-profile-name');
    const emailEl = document.getElementById('settings-profile-email');
    if (imgEl && state.googleUser.picture) imgEl.src = state.googleUser.picture;
    if (nameEl) nameEl.textContent = state.googleUser.name;
    if (emailEl) emailEl.textContent = state.googleUser.email;
  } else {
    // 데모 모드
    if (googleProfile) googleProfile.style.display = 'none';
    if (demoProfile) demoProfile.style.display = 'block';
    const accountType = document.getElementById('settings-account-type');
    if (accountType) {
      accountType.textContent = '체험용 데모 계정';
      accountType.style.color = 'var(--text-secondary)';
    }
  }
}

// 미사용 함수 (하위 호환성 유지용 빈체)
function updateSettingsApiKey() {}
function openApiGuide() {}
function closeApiGuide() {}


// 여행 계획 검색 트리거
async function triggerSearch() {
  const departure = selectSearchDeparture.value.trim();
  const destination = inputDestination.value.trim();
  const duration = selectDuration.value;
  const companion = selectCompanion.value;

  if (!departure) {
    alert('출발지를 입력해 주세요. (예: 서울 마포구, 부산 해운대구 등)');
    return;
  }

  if (!destination) {
    alert('목적지를 입력해 주세요. (예: 경주, 부산, 후쿠오카 등)');
    return;
  }

  // 자녀 정보 수집
  let kidsCount = 0;
  let kidsAges = [];
  if (companion === 'family') {
    kidsCount = parseInt(textKidsCount.textContent);
    const checkedAges = document.querySelectorAll('.age-chip input:checked');
    checkedAges.forEach(input => {
      kidsAges.push(input.value);
    });
    if (kidsAges.length === 0) {
      alert('자녀의 연령대를 최소 하나 이상 선택해 주세요.');
      return;
    }
  }

  const params = { departure, destination, duration, companion, kidsCount, kidsAges };
  state.activeParams = params;

  // 로딩 화면 활성화
  const skeleton = document.getElementById('results-skeleton');
  const resultsContainer = document.getElementById('results-container');
  
  resultsContainer.classList.remove('active');
  skeleton.classList.add('active');
  
  // 결과 위치로 부드러운 스크롤
  skeleton.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    let resultData = null;

    // 데모 모드 분기 처리
    if (state.isDemoMode) {
      // 데모 데이터 매칭 분석
      const isJejuMatch = (destination.includes('제주') || destination.toLowerCase().includes('jeju')) && companion === 'family';
      const isGyeongjuMatch = (destination.includes('경주') || destination.toLowerCase().includes('gyeongju')) && companion === 'family';

      if (isJejuMatch) {
        resultData = DEMO_DATA.seoul_jeju_family;
      } else if (isGyeongjuMatch) {
        resultData = DEMO_DATA.busan_gyeongju_family;
      } else {
        // 데모 매칭 데이터가 없을 때 가이드
        const wantFallback = confirm(
          `현재는 [API 키 없는 데모 모드]입니다.\n\n입력하신 "${destination}"에 대한 실시간 계획을 짜려면 API 키가 필요합니다. 대신 준비된 고품질 샘플 일정인 [서울 출발 -> 제주도 2박 3일 가족 여행] 코스를 보시겠습니까?\n\n(설정 탭에서 본인의 Gemini API 키를 저장하면 모든 지역의 실시간 커스텀 검색이 가능해집니다.)`
        );
        if (wantFallback) {
          resultData = DEMO_DATA.seoul_jeju_family;
          // 목적지 입력란 동기화
          inputDestination.value = '제주도';
        } else {
          skeleton.classList.remove('active');
          return;
        }
      }
    } else {
      // 라이브 AI 연동
      resultData = await generateItinerary(state.apiKey, params);
    }

    state.currentPlan = resultData;
    renderResults(resultData, params);

    skeleton.classList.remove('active');
    resultsContainer.classList.add('active');
    
    // 결과 화면 상단으로 부드러운 스크롤
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (error) {
    skeleton.classList.remove('active');
    alert(`여정 생성에 실패했습니다: ${error.message}\n\nAPI 키가 올바른지 확인해 보거나 잠시 후 다시 시도해 주세요.`);
  }
}

// 결과 렌더링 엔진
function renderResults(data, params) {
  // 1. 헤더/기본 정보 세팅
  document.getElementById('res-dest-name').textContent = data.destination || params.destination;
  document.getElementById('res-duration').textContent = data.duration || params.duration;
  document.getElementById('res-suitability').textContent = data.suitability || '';

  // 2. 저장(북마크) 상태 체크 & 아이콘 갱신
  updateSaveButtonUI();

  // 3. 교통 정보
  document.getElementById('res-transit-method').textContent = data.transportation?.method || '대중교통 / 자차';
  document.getElementById('res-transit-duration').textContent = data.transportation?.duration_desc || '이동시간 확인 필요';
  document.getElementById('res-transit-details').textContent = data.transportation?.details || '';

  const transitLinksBox = document.getElementById('res-transit-links');
  transitLinksBox.innerHTML = '';
  if (data.transportation?.booking_links && data.transportation.booking_links.length > 0) {
    data.transportation.booking_links.forEach(link => {
      const a = document.createElement('a');
      a.href = link.url;
      a.target = '_blank';
      a.className = 'link-btn';
      a.innerHTML = `
        <span>${link.name}</span>
        <svg viewBox="0 0 24 24" style="width:10px; height:10px;"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
      `;
      transitLinksBox.appendChild(a);
    });
  } else {
    // 기본 예약 링크 제공
    transitLinksBox.innerHTML = `
      <a href="https://www.letskorail.com/" target="_blank" class="link-btn">KTX 승차권 예매</a>
      <a href="https://www.skyscanner.co.kr/" target="_blank" class="link-btn">실시간 항공권 검색</a>
    `;
  }

  // 4. 일자별 상세 일정(타임라인)
  const timelineBox = document.getElementById('res-timeline');
  timelineBox.innerHTML = '';

  if (data.itinerary && data.itinerary.length > 0) {
    data.itinerary.forEach(dayInfo => {
      // 일자 헤더 추가
      const dayHeader = document.createElement('div');
      dayHeader.className = 'timeline-day-header';
      dayHeader.textContent = `Day ${dayInfo.day}`;
      timelineBox.appendChild(dayHeader);

      if (dayInfo.routes && dayInfo.routes.length > 0) {
        dayInfo.routes.forEach(route => {
          const item = document.createElement('div');
          item.className = `timeline-item ${route.type || 'attraction'}`;

          const typeNameMap = {
            attraction: '명소',
            restaurant: '식사',
            transport: '이동',
            hotel: '숙소'
          };

          // 노드(점)
          const node = document.createElement('div');
          node.className = 'timeline-node';
          item.appendChild(node);

          // 콘텐츠
          const content = document.createElement('div');
          content.className = 'timeline-content';

          // 시간 및 타입 뱃지
          const timeBadgeHtml = `
            <div class="timeline-time">
              <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
              <span>${route.time || ''}</span>
              <span class="type-badge ${route.type || 'attraction'}">${typeNameMap[route.type] || '관광'}</span>
            </div>
          `;

          // 제목 & 설명
          const bodyHtml = `
            <div class="timeline-title">${route.title || ''}</div>
            <div class="timeline-desc">${route.description || ''}</div>
          `;

          // 동반자 맞춤형 팁
          let tipHtml = '';
          if (route.tip) {
            tipHtml = `
              <div class="timeline-tip">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                <span>${route.tip}</span>
              </div>
            `;
          }

          content.innerHTML = timeBadgeHtml + bodyHtml + tipHtml;
          item.appendChild(content);
          timelineBox.appendChild(item);
        });
      }
    });
  }

  // 5. 추천 숙소
  const hotelBox = document.getElementById('res-accommodations');
  hotelBox.innerHTML = '';

  if (data.accommodations && data.accommodations.length > 0) {
    data.accommodations.forEach(hotel => {
      const card = document.createElement('div');
      card.className = 'hotel-card';

      // 예약 검색 딥링크 자동 생성
      let finalLink = hotel.booking_link || '';
      if (!finalLink || finalLink.startsWith('http') === false) {
        // 아고다 자동 검색 쿼리 빌드
        const searchQuery = encodeURIComponent(`${params.destination} ${hotel.name}`);
        finalLink = `https://www.agoda.com/ko-kr/search?query=${searchQuery}`;
      }

      card.innerHTML = `
        <div class="hotel-header">
          <div>
            <div class="hotel-name">${hotel.name}</div>
            <span class="hotel-type">${hotel.type || '추천숙소'}</span>
          </div>
          <div class="hotel-rating">
            <svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
            <span>${hotel.rating || '4.5/5'}</span>
          </div>
        </div>
        <div class="hotel-desc">${hotel.description || ''}</div>
        <a href="${finalLink}" target="_blank" class="link-btn" style="width: 100%; justify-content: center; background:rgba(255,255,255,0.05); border-color:var(--card-border);">
          <span>실시간 최저가 확인 및 예약하기</span>
          <svg viewBox="0 0 24 24" style="width:10px; height:10px;"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
        </a>
      `;
      hotelBox.appendChild(card);
    });
  } else {
    hotelBox.innerHTML = '<div class="empty-state">추천 숙소 정보가 없습니다.</div>';
  }

  // 6. 맛집 추천 리스트
  const restaurantBox = document.getElementById('res-restaurants');
  restaurantBox.innerHTML = '';

  if (data.restaurants && data.restaurants.length > 0) {
    data.restaurants.forEach(rest => {
      const card = document.createElement('div');
      card.className = 'scroll-card';

      // 네이버 플레이스 검색 링크 자동 생성
      const mapSearchQuery = encodeURIComponent(rest.name);
      const mapLink = `https://search.naver.com/search.naver?query=${mapSearchQuery}`;

      card.innerHTML = `
        <div class="scroll-card-header">
          <div class="scroll-card-title">${rest.name}</div>
          <div class="scroll-card-subtitle">${rest.menu}</div>
        </div>
        <div class="scroll-card-desc">${rest.reason}</div>
        <a href="${mapLink}" target="_blank" class="link-btn" style="padding: 5px 10px; font-size: 11px; align-self: flex-start; margin-top: auto;">
          <span>위치 및 정보 보기</span>
        </a>
      `;
      restaurantBox.appendChild(card);
    });
  } else {
    restaurantBox.innerHTML = '<div class="empty-state">추천 맛집 정보가 없습니다.</div>';
  }

  // 7. 할인 꿀팁
  const discountBox = document.getElementById('res-discounts');
  discountBox.innerHTML = '';

  if (data.discounts && data.discounts.length > 0) {
    data.discounts.forEach(tip => {
      const item = document.createElement('div');
      item.className = 'discount-item';
      item.innerHTML = `
        <div class="discount-header">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/></svg>
          <span>${tip.title}</span>
        </div>
        <div class="discount-desc">${tip.description}</div>
      `;
      discountBox.appendChild(item);
    });
  } else {
    // 디폴트 다자녀 팁 제공
    discountBox.innerHTML = `
      <div class="discount-item">
        <div class="discount-header">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/></svg>
          <span>KTX/SRT 다자녀 승차권 30% 감면</span>
        </div>
        <div class="discount-desc">코레일멤버십 회원 중 만 25세 미만 자녀 2명 이상을 둔 가족은 홈페이지에 등록을 마치면 성인 운임의 30%를 할인받을 수 있습니다.</div>
      </div>
    `;
  }
}

// 북마크 저장 토글
function toggleSaveCurrentPlan() {
  if (!state.currentPlan) return;

  const currentPlanId = `${state.currentPlan.destination}_${state.currentPlan.duration}`.replace(/\s+/g, '');
  const index = state.savedPlans.findIndex(p => p.id === currentPlanId);

  if (index > -1) {
    // 이미 저장됨 -> 삭제
    state.savedPlans.splice(index, 1);
    alert('보관함에서 일정이 삭제되었습니다.');
  } else {
    // 저장
    const planToSave = {
      id: currentPlanId,
      params: state.activeParams,
      data: state.currentPlan,
      savedAt: new Date().toLocaleDateString()
    };
    state.savedPlans.push(planToSave);
    alert('나만의 보관함에 일정이 추가되었습니다! [보관함] 탭에서 오프라인 중에도 언제든 확인하실 수 있습니다.');
  }

  localStorage.setItem('travel_saved_plans', JSON.stringify(state.savedPlans));
  updateSaveButtonUI();
}

// 저장 버튼의 UI 스타일 갱신
function updateSaveButtonUI() {
  const saveBtn = document.getElementById('btn-save-plan');
  const saveBtnText = document.getElementById('save-btn-text');
  if (!saveBtn || !state.currentPlan) return;

  const currentPlanId = `${state.currentPlan.destination}_${state.currentPlan.duration}`.replace(/\s+/g, '');
  const isSaved = state.savedPlans.some(p => p.id === currentPlanId);

  if (isSaved) {
    saveBtn.classList.add('saved');
    saveBtnText.textContent = '★ 일정 보관 완료';
  } else {
    saveBtn.classList.remove('saved');
    saveBtnText.textContent = '이 일정 보관하기';
  }
}

// 보관함 목록 렌더링
function renderSavedPlansList() {
  const listEl = document.getElementById('saved-plans-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (state.savedPlans.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/></svg>
        <p>보관한 일정이 없습니다.<br>나만의 맞춤 여행 경로를 탐색하고 보관해 보세요!</p>
      </div>
    `;
    return;
  }

  state.savedPlans.forEach(plan => {
    const card = document.createElement('div');
    card.className = 'saved-card';

    let infoText = `${plan.params.departure} 출발 • ${plan.data.duration}`;
    if (plan.params.companion === 'family') {
      infoText += ` • 자녀 ${plan.params.kidsCount}명`;
    }

    card.innerHTML = `
      <div class="saved-info">
        <h4>${plan.data.destination}</h4>
        <p>${infoText}</p>
        <span style="font-size:10px; color:rgba(255,255,255,0.25);">저장일: ${plan.savedAt}</span>
      </div>
      <div class="saved-actions">
        <button class="saved-view-btn" onclick="viewSavedPlan('${plan.id}')">보기</button>
        <button class="saved-delete-btn" onclick="deleteSavedPlan('${plan.id}')" title="삭제">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    `;
    listEl.appendChild(card);
  });
}

// 보관함 항목 보기
function viewSavedPlan(id) {
  const plan = state.savedPlans.find(p => p.id === id);
  if (!plan) return;

  state.currentPlan = plan.data;
  state.activeParams = plan.params;

  // 목적지 검색어 동기화
  if (inputDestination) inputDestination.value = plan.data.destination;
  if (selectSearchDeparture) selectSearchDeparture.value = plan.params.departure;
  if (selectDuration) selectDuration.value = plan.params.duration;
  if (selectCompanion) {
    selectCompanion.value = plan.params.companion;
    toggleCompanionDetails(plan.params.companion);
  }
  if (plan.params.companion === 'family' && textKidsCount) {
    textKidsCount.textContent = plan.params.kidsCount;
    // 체크박스 복구
    const chips = document.querySelectorAll('.age-chip input');
    chips.forEach(chip => {
      chip.checked = plan.params.kidsAges.includes(chip.value);
    });
  }

  // 탐색 탭으로 전환
  switchTab('explore');

  // 결과 화면 그리기
  const resultsContainer = document.getElementById('results-container');
  renderResults(plan.data, plan.params);
  resultsContainer.classList.add('active');
  
  // 부드러운 스크롤 이동
  resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 보관함 항목 삭제
function deleteSavedPlan(id) {
  if (confirm('보관함에서 이 일정을 영구 삭제하시겠습니까?')) {
    state.savedPlans = state.savedPlans.filter(p => p.id !== id);
    localStorage.setItem('travel_saved_plans', JSON.stringify(state.savedPlans));
    
    // 현재 표시 중인 결과창이 삭제된 것일 경우 버튼 스타일 동기화
    if (state.currentPlan) {
      const currentPlanId = `${state.currentPlan.destination}_${state.currentPlan.duration}`.replace(/\s+/g, '');
      if (currentPlanId === id) {
        updateSaveButtonUI();
      }
    }

    renderSavedPlansList();
  }
}

// 윈도우 글로벌 네임스페이스 바인딩 (HTML 인라인 이벤트용)
window.handleLogin = handleLogin;
window.handleDemoLogin = handleDemoLogin;
window.openApiGuide = openApiGuide;
window.closeApiGuide = closeApiGuide;
window.toggleCompanionDetails = toggleCompanionDetails;
window.updateCounter = updateCounter;
window.setQuickSearch = setQuickSearch;
window.triggerSearch = triggerSearch;
window.toggleSaveCurrentPlan = toggleSaveCurrentPlan;
window.switchTab = switchTab;
window.handleLogout = handleLogout;
window.updateSettingsDeparture = updateSettingsDeparture;
window.updateSettingsApiKey = updateSettingsApiKey;
window.deleteSavedPlan = deleteSavedPlan;
window.viewSavedPlan = viewSavedPlan;
window.saveDefaultDeparture = saveDefaultDeparture;
