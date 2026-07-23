import type { Coordinate, DemoCourier, DemoRoute, DemoVehicle, DevDb } from './model';

export const demoCustomerId = 'customer-dsv';
export const demoOrderKey = 'DSV-2026-0709-01';

export function demoDeliveryDate(dayOffset = 0): string {
  return new Date(Date.now() + (9 * 60 + dayOffset * 24 * 60) * 60_000).toISOString().slice(0, 10);
}

export const devDb: DevDb = {
  customers: [
    { id: demoCustomerId, name: 'CLEVER - 고객사 Demo', billingCode: 'DSV-DEMO' },
    { id: 'customer-private-other', name: '타 고객사', billingCode: 'PRIVATE-SENTINEL' },
  ],
  customerUsers: [
    { id: 'user-dsv-admin', customerId: demoCustomerId, name: '김관제', role: 'admin', email: 'control@dsv.example' },
    { id: 'user-dsv-viewer', customerId: demoCustomerId, name: '이고객', role: 'viewer', email: 'viewer@dsv.example' },
  ],
  vehicles: [
    { id: 'vehicle-101', plate: '34자 7412', label: 'CR-101 냉장탑차', type: 'refrigerated-truck', status: 'completed' },
    { id: 'vehicle-204', plate: '24나 6404', label: 'CR-204 윙바디', type: 'wing-body', status: 'current' },
    { id: 'vehicle-330', plate: '33사 7311', label: 'CR-330 긴급차량', type: 'emergency-van', status: 'current' },
    { id: 'vehicle-303', plate: '23바 6303', label: 'CR-303 냉장탑차', type: 'refrigerated-truck', status: 'current' },
    { id: 'vehicle-207', plate: '32바 7207', label: 'CR-207 냉장탑차', type: 'refrigerated-truck', status: 'current' },
    { id: 'vehicle-410', plate: '45가 8102', label: 'CR-410 냉장탑차', type: 'refrigerated-truck', status: 'planned' },
  ],
  drivers: [
    { id: 'driver-101', name: '김민수', phone: '010-1000-0101', baseArea: '강남권' },
    { id: 'driver-204', name: '이준호', phone: '010-2000-0204', baseArea: '강남권' },
    { id: 'driver-330', name: '박서연', phone: '010-3000-0330', baseArea: '강북권' },
    { id: 'driver-303', name: '최도윤', phone: '010-3000-0303', baseArea: '송파권' },
    { id: 'driver-207', name: '정하늘', phone: '010-2000-0207', baseArea: '경기남부' },
    { id: 'driver-410', name: '한지민', phone: '010-4000-0410', baseArea: '수원권' },
  ],
  orders: [
    {
      id: 'order-0709-01',
      customerId: demoCustomerId,
      orderKey: demoOrderKey,
      title: '강남 바이오 콜드체인',
      routeName: '서울 남부 1권역',
      status: 'current',
      deliveryDate: demoDeliveryDate(0),
      requestedAt: '2026-07-09T08:30:00+09:00',
    },
    {
      id: 'order-0709-02',
      customerId: demoCustomerId,
      orderKey: 'DSV-2026-0709-02',
      title: '인천 항공 긴급배송',
      routeName: '인천공항 특송',
      status: 'completed',
      deliveryDate: demoDeliveryDate(-1),
      requestedAt: '2026-07-09T06:10:00+09:00',
    },
    {
      id: 'order-next-01',
      customerId: demoCustomerId,
      orderKey: 'DSV-SCHEDULED-03',
      title: '수원 연구시설 정기배송',
      routeName: '경기 남부 정기노선',
      status: 'planned',
      deliveryDate: demoDeliveryDate(1),
      requestedAt: '2026-07-09T07:40:00+09:00',
    },
  ],
  orderItems: [
    { id: 'item-vaccine', orderId: 'order-0709-01', customerId: demoCustomerId, name: '백신 보냉박스', quantity: '8박스', temperatureBand: 'cold' },
    { id: 'item-kit', orderId: 'order-0709-01', customerId: demoCustomerId, name: '진단키트 냉장 검체', quantity: '4박스', temperatureBand: 'cold' },
    { id: 'item-medicine', orderId: 'order-0709-01', customerId: demoCustomerId, name: '의약품 리필 세트', quantity: '6박스', temperatureBand: 'cold' },
    { id: 'item-device', orderId: 'order-0709-01', customerId: demoCustomerId, name: '연구 장비 팔레트', quantity: '2팔레트', temperatureBand: 'ambient' },
    { id: 'item-supply', orderId: 'order-0709-01', customerId: demoCustomerId, name: '소모품 정기배송', quantity: '10박스', temperatureBand: 'ambient' },
    { id: 'item-private-sentinel', orderId: 'order-0709-01', customerId: 'customer-private-other', name: '타 고객 개인정보 검체', quantity: '99박스', temperatureBand: 'cold' },
    { id: 'item-air', orderId: 'order-0709-02', customerId: demoCustomerId, name: '항공 특송 서류함', quantity: '3박스', temperatureBand: 'ambient' },
    { id: 'item-next-reagent', orderId: 'order-next-01', customerId: demoCustomerId, name: '연구 시약 상온박스', quantity: '6박스', temperatureBand: 'ambient' },
  ],
  deliveryStops: [
    { id: 'stop-gangnam', orderId: 'order-0709-01', customerId: demoCustomerId, stopNo: 12, customerName: '강남세브란스 물류실', address: '서울 강남구 언주로 211', status: 'completed', eta: '오후 05:08', itemIds: ['item-vaccine'] },
    { id: 'stop-yeoksam', orderId: 'order-0709-01', customerId: demoCustomerId, stopNo: 24, customerName: '역삼 진단센터', address: '서울 강남구 테헤란로 152', status: 'current', eta: '오후 05:14', itemIds: ['item-kit'] },
    { id: 'stop-seolleung', orderId: 'order-0709-01', customerId: demoCustomerId, stopNo: 31, customerName: '대치 의약품 창구', address: '서울 강남구 삼성로 417', status: 'planned', eta: '오후 05:20', itemIds: ['item-medicine'] },
    { id: 'stop-pangyo', orderId: 'order-0709-01', customerId: demoCustomerId, stopNo: 44, customerName: '판교 메디컬 허브', address: '경기 성남시 분당구 판교역로 166', status: 'planned', eta: '오후 05:26', itemIds: ['item-device'] },
    { id: 'stop-suji', orderId: 'order-0709-01', customerId: demoCustomerId, stopNo: 58, customerName: '수지 헬스케어 센터', address: '경기 용인시 수지구 풍덕천로 129', status: 'planned', eta: '오후 05:32', itemIds: ['item-supply'] },
    { id: 'stop-private-sentinel', orderId: 'order-0709-01', customerId: 'customer-private-other', stopNo: 99, customerName: '비공개 병원', address: '비공개 주소', status: 'planned', eta: '오후 05:38', itemIds: ['item-private-sentinel'] },
    { id: 'stop-incheon-air', orderId: 'order-0709-02', customerId: demoCustomerId, stopNo: 77, customerName: '인천공항 화물터미널', address: '인천 중구 공항동로 295', status: 'completed', eta: '오전 11:45', itemIds: ['item-air'] },
    { id: 'stop-suwon-next', orderId: 'order-next-01', customerId: demoCustomerId, stopNo: 88, customerName: '수원 연구시설', address: '경기 수원시 영통구 광교로 145', status: 'planned', eta: '오전 10:20', itemIds: ['item-next-reagent'] },
  ],
  routePlanStops: [
    { id: 'route-101-1', orderId: 'order-0709-01', vehicleId: 'vehicle-101', driverId: 'driver-101', deliveryStopId: 'stop-gangnam', plannedSequence: 10, remainingTime: '배송 완료', arrivalEta: '16:33 도착', dwellUnloadEstimate: '하차 8분 완료' },
    { id: 'route-204-1', orderId: 'order-0709-01', vehicleId: 'vehicle-204', driverId: 'driver-204', deliveryStopId: 'stop-yeoksam', plannedSequence: 20, remainingTime: '38분 남음', arrivalEta: '14:20 도착 예정', dwellUnloadEstimate: '하차 12분 예상' },
    { id: 'route-204-2', orderId: 'order-0709-01', vehicleId: 'vehicle-204', driverId: 'driver-204', deliveryStopId: 'stop-seolleung', plannedSequence: 30, remainingTime: '44분 남음', arrivalEta: '14:32 도착 예정', dwellUnloadEstimate: '하차 10분 예상' },
    { id: 'route-330-1', orderId: 'order-0709-01', vehicleId: 'vehicle-330', driverId: 'driver-330', deliveryStopId: 'stop-pangyo', plannedSequence: 40, remainingTime: '24초', arrivalEta: '14:45 도착 예정', dwellUnloadEstimate: '하차 18분 예상' },
    { id: 'route-207-1', orderId: 'order-0709-01', vehicleId: 'vehicle-207', driverId: 'driver-207', deliveryStopId: 'stop-suji', plannedSequence: 50, remainingTime: '1분 06초', arrivalEta: '15:05 도착 예정', dwellUnloadEstimate: '하차 18분 예상' },
    { id: 'route-303-private', orderId: 'order-0709-01', vehicleId: 'vehicle-303', driverId: 'driver-303', deliveryStopId: 'stop-private-sentinel', plannedSequence: 60, remainingTime: '보호 대상', arrivalEta: '비공개', dwellUnloadEstimate: '비공개' },
    { id: 'route-330-air', orderId: 'order-0709-02', vehicleId: 'vehicle-330', driverId: 'driver-330', deliveryStopId: 'stop-incheon-air', plannedSequence: 10, remainingTime: '배송 완료', arrivalEta: '11:45 도착', dwellUnloadEstimate: '하차 9분 완료' },
    { id: 'route-410-next', orderId: 'order-next-01', vehicleId: 'vehicle-410', driverId: 'driver-410', deliveryStopId: 'stop-suwon-next', plannedSequence: 10, remainingTime: '익일 출발', arrivalEta: '10:20 도착 예정', dwellUnloadEstimate: '하차 15분 예상' },
  ],
  proofMedia: [
    { id: 'proof-gangnam-photo', orderId: 'order-0709-01', deliveryStopId: 'stop-gangnam', kind: 'photo', label: '물류실 인수 사진', capturedAt: '2026-07-09T16:33:00+09:00' },
    { id: 'proof-gangnam-sign', orderId: 'order-0709-01', deliveryStopId: 'stop-gangnam', kind: 'signature', label: '전자서명', capturedAt: '2026-07-09T16:34:00+09:00' },
    { id: 'proof-yeoksam-photo', orderId: 'order-0709-01', deliveryStopId: 'stop-yeoksam', kind: 'photo', label: '도착 예정 사진' },
  ],
};

export const routeOrigin = {
  name: '군포복합물류센터',
  address: '부곡동 1231, 경기도 군포시 번영로 82 한국복합물류(주)',
  coordinate: [126.9372235, 37.330948] as Coordinate,
};

export const demoCouriers: DemoCourier[] = [
  { id: 'c01', name: '김도윤', avatar: '👤', age: 42, gender: '남성', career: '냉장 의약품 6년', zone: '강남 서초', score: 'A+', traits: ['병원 하역장 숙련', 'POD 누락 0건', '온도기록계 확인 빠름'] },
  { id: 'c02', name: '이서연', avatar: '👤', age: 36, gender: '여성', career: '검체 운송 4년', zone: '마포 영등포', score: 'A', traits: ['검체 인수증 꼼꼼', '야간 배송 가능', '주차 동선 메모 우수'] },
  { id: 'c03', name: '박민재', avatar: '👤', age: 31, gender: '남성', career: '백신 배송 3년', zone: '송파 강동', score: 'A', traits: ['대형병원 보안절차 숙지', '정차시간 준수', '냉장 박스 회수 빠름'] },
  { id: 'c04', name: '정하린', avatar: '👤', age: 45, gender: '여성', career: '의약품 물류 8년', zone: '종로 중구', score: 'S', traits: ['VIP 병원 담당', '분실사고 0건', '거래명세표 확인 강점'] },
  { id: 'c05', name: '최유준', avatar: '👤', age: 29, gender: '남성', career: '상온/냉장 복합 2년', zone: '수원 동탄', score: 'B+', traits: ['장거리 루트 적응', '상차 검수 빠름', '긴급 콜 대응'] },
  { id: 'c06', name: '오지민', avatar: '👤', age: 39, gender: '여성', career: '임상시험 검체 5년', zone: '강북 서대문', score: 'A+', traits: ['연구실 직접 인계', '온도 이탈 보고 빠름', '담당자 연락망 풍부'] },
  { id: 'c07', name: '한태오', avatar: '👤', age: 34, gender: '남성', career: '응급 배송 4년', zone: '서울 전역', score: 'A', traits: ['대체 경로 판단 빠름', '교통 지연 보고', '새벽 배송 가능'] },
  { id: 'c08', name: '윤서준', avatar: '👤', age: 33, gender: '남성', career: '특장차 운행 5년', zone: '강남 서초', score: 'A', traits: ['상차 대기 관리', '냉장칸 봉인 확인', '병원 후문 동선 숙지'] },
  { id: 'c09', name: '문채원', avatar: '👤', age: 37, gender: '여성', career: '병원 배송 6년', zone: '마포 영등포', score: 'A+', traits: ['정시 도착률 우수', '인수증 확인 꼼꼼', '검체 라벨 재확인'] },
  { id: 'c10', name: '서준호', avatar: '👤', age: 40, gender: '남성', career: '백신 배송 7년', zone: '송파 강동', score: 'S', traits: ['대형병원 하차 숙련', '온도 경고 대응 빠름', '야간 보안절차 숙지'] },
  { id: 'c11', name: '강하윤', avatar: '👤', age: 32, gender: '여성', career: '경기 남부 배송 4년', zone: '수원 동탄', score: 'A', traits: ['우회 경로 판단', '지연 보고 정확', '긴급 배송 대응'] },
  { id: 'c12', name: '임태준', avatar: '👤', age: 43, gender: '남성', career: '도심 병원 배송 9년', zone: '종로 중구', score: 'S', traits: ['증빙자료 누락 방지', '거래명세표 확인', '주차 위치 메모'] },
  { id: 'c13', name: '배유나', avatar: '👤', age: 35, gender: '여성', career: '냉장 의약품 5년', zone: '송파 강동', score: 'A+', traits: ['회수품 정리 빠름', 'POD 촬영 정확', '배송 완료 보고 신속'] },
];

export const routeStops: Record<DemoRoute, string[]> = {
  west: ['서울월드컵경기장', 'DMC 누리꿈스퀘어', '홍대입구역', '이화여자대학교', '공덕역', 'IFC 서울', '국회의사당', '타임스퀘어', '목동종합운동장', '구로디지털단지역', '가산디지털단지역', '대항병원, 연세사랑병원'],
  gangnam: ['강남역', '역삼역', '선릉역', '삼성역', '코엑스', '봉은사', '청담역', '압구정로데오역', '강남구청역', '논현역', '신논현역', '교대역'],
  songpa: ['잠실역', '롯데월드타워', '석촌호수', '송파구청', '올림픽공원', '서울아산병원', '몽촌토성역', '가락시장역', '문정역', '장지역', '수서역', '삼성서울병원'],
  central: ['서울성모병원', '국립중앙의료원', '서울대학교병원', '세브란스병원', '강북삼성병원', '서울역', '명동역', '을지로입구역', '종각역', '광화문', '경복궁역', '안국역'],
  south: ['한림대학교성심병원', '평촌역', '안양샘병원', '의왕역', '성균관대역', '아주대학교병원', '광교중앙역', '수원시청역', '수원역', '화서역', '동탄성심병원', '동탄역'],
};

export const routeCoordinates: Record<DemoRoute, Coordinate[]> = {
  west: [[126.897236, 37.568248], [126.889083, 37.57963], [126.923708, 37.557192], [126.945667, 37.561798], [126.951646, 37.544317], [126.924825, 37.525087], [126.914166, 37.5326], [126.90364, 37.517001], [126.883057, 37.530184], [126.90153, 37.485266], [126.882668, 37.481589], [126.987863, 37.475586]],
  gangnam: [[127.027619, 37.497952], [127.036545, 37.500643], [127.04898, 37.504503], [127.06316, 37.508844], [127.059159, 37.511823], [127.05735, 37.514912], [127.053982, 37.519365], [127.040534, 37.527381], [127.041287, 37.517186], [127.021415, 37.511093], [127.02506, 37.504598], [127.014631, 37.49347]],
  songpa: [[127.100159, 37.513261], [127.10249, 37.512464], [127.104302, 37.509876], [127.106431, 37.514477], [127.122744, 37.520863], [127.108936, 37.526576], [127.112976, 37.517409], [127.118308, 37.492888], [127.12247, 37.485855], [127.126732, 37.478703], [127.101184, 37.487468], [127.085151, 37.488297]],
  central: [[127.005079, 37.501987], [127.005868, 37.567214], [126.999016, 37.579716], [126.940642, 37.562345], [126.96775, 37.568581], [126.970606, 37.554678], [126.986535, 37.560989], [126.982227, 37.566037], [126.982923, 37.570214], [126.976897, 37.575929], [126.973166, 37.575762], [126.98547, 37.576477]],
  south: [[126.961863, 37.391746], [126.964709, 37.394287], [126.930398, 37.392829], [126.948376, 37.320859], [126.971052, 37.300333], [127.047533, 37.279447], [127.051107, 37.288617], [127.030736, 37.261911], [126.999697, 37.265974], [126.989613, 37.283893], [127.078433, 37.216025], [127.095857, 37.200339]],
};

export const workAreaLabels: Record<DemoRoute, string[]> = {
  west: ['마포 서대문', '여의도 영등포', '구로 강남 연계'],
  gangnam: ['강남역 역삼', '삼성 청담', '논현 교대'],
  songpa: ['잠실 송파', '올림픽 가락', '문정 수서'],
  central: ['서초 도심 병원', '서울역 명동', '종로 광화문'],
  south: ['안양 평촌', '수원 광교', '화성 동탄'],
};

export const demoVehicles: DemoVehicle[] = [
  { id: 'load01', plate: '11바 1201', route: 'gangnam', courierId: 'c08', location: '상차 중 출발 대기', eta: '상차 대기', status: '상차', routeStartedAt: null, done: 0, history: ['강남역', '역삼역', '선릉역'] },
  { id: 'load02', plate: '12바 2302', route: 'west', courierId: 'c02', location: '상차 중 검수 대기', eta: '검수 대기', status: '상차', routeStartedAt: null, done: 0, history: ['홍대입구역', '공덕역', 'IFC 서울', '타임스퀘어'] },
  { id: 'load03', plate: '13사 3403', route: 'songpa', courierId: 'c03', location: '상차 중 온도기록계 확인', eta: '온도 확인', status: '상차', routeStartedAt: null, done: 0, history: ['잠실역', '송파구청', '가락시장역'] },
  { id: 'load04', plate: '14자 4504', route: 'central', courierId: 'c04', location: '상차 중 출고 지시 대기', eta: '출고 대기', status: '상차', routeStartedAt: null, done: 0, history: ['서울성모병원', '종각역', '안국역'] },
  { id: 'load05', plate: '15바 5605', route: 'south', courierId: 'c05', location: '상차 중 3분 뒤 출발', eta: '3분 뒤 출발', status: '상차', routeStartedAt: null, done: 0, history: ['평촌역', '수원역', '동탄역'] },
  { id: 'depart01', plate: '21사 6101', route: 'gangnam', courierId: 'c01', location: '군포복합물류센터', eta: '35분 12초', status: '이동중', routeStartedAt: '2026-07-10T08:30:00+09:00', done: 0, history: ['역삼역', '삼성역', '봉은사', '압구정로데오역', '논현역', '교대역'] },
  { id: 'to02', plate: '22자 6202', route: 'west', courierId: 'c09', location: '1번 배송지 이동', eta: '1번 이동', status: '이동중', routeStartedAt: '2026-07-10T08:25:00+09:00', done: 0, history: ['DMC 누리꿈스퀘어', '홍대입구역', '공덕역'] },
  { id: 'to10', plate: '23바 6303', route: 'songpa', courierId: 'c10', location: '10번 배송지 이동', eta: '10번 이동', status: '이동중', routeStartedAt: '2026-07-10T07:40:00+09:00', actualArrivals: ['2026-07-10T08:18:00+09:00', '2026-07-10T08:27:00+09:00', '2026-07-10T08:36:00+09:00', '2026-07-10T08:44:00+09:00', '2026-07-10T08:54:00+09:00', '2026-07-10T09:05:00+09:00', '2026-07-10T09:13:00+09:00', '2026-07-10T09:22:00+09:00', '2026-07-10T09:31:00+09:00'], done: 9, history: ['잠실역', '몽촌토성역', '장지역'] },
  { id: 'final12', plate: '24사 6404', route: 'central', courierId: 'c06', location: '12번 1분 뒤 도착 후 종료', eta: '1분 뒤 도착', status: '이동중', routeStartedAt: '2026-07-10T07:20:00+09:00', actualArrivals: ['2026-07-10T08:03:00+09:00', '2026-07-10T08:18:00+09:00', '2026-07-10T08:30:00+09:00', '2026-07-10T08:42:00+09:00', '2026-07-10T08:54:00+09:00', '2026-07-10T09:05:00+09:00', '2026-07-10T09:14:00+09:00', '2026-07-10T09:24:00+09:00', '2026-07-10T09:34:00+09:00', '2026-07-10T09:44:00+09:00', '2026-07-10T09:54:00+09:00'], done: 11, history: ['강북삼성병원', '서울역', '명동역'] },
  { id: 'unload04', plate: '31자 7104', route: 'gangnam', courierId: 'c07', location: '정차 상품 하차 중', eta: '하차 5분', status: '하차중', routeStartedAt: '2026-07-10T08:05:00+09:00', actualArrivals: ['2026-07-10T08:40:00+09:00', '2026-07-10T08:50:00+09:00', '2026-07-10T08:59:00+09:00'], done: 3, history: ['강남역', '선릉역', '코엑스'] },
  { id: 'delay07', plate: '32바 7207', route: 'south', courierId: 'c11', location: '교통 지연 7번 이동', eta: '지연', status: '이동중', routeStartedAt: '2026-07-10T07:55:00+09:00', actualArrivals: ['2026-07-10T08:21:00+09:00', '2026-07-10T08:30:00+09:00', '2026-07-10T08:43:00+09:00', '2026-07-10T09:01:00+09:00', '2026-07-10T09:14:00+09:00', '2026-07-10T09:30:00+09:00'], done: 6, history: ['한림대학교성심병원', '수원시청역', '동탄성심병원'] },
  { id: 'proof11', plate: '33사 7311', route: 'central', courierId: 'c12', location: '증빙 확인 필요 11번 이동', eta: '증빙 확인', status: '이동중', routeStartedAt: '2026-07-10T07:30:00+09:00', actualArrivals: ['2026-07-10T08:10:00+09:00', '2026-07-10T08:24:00+09:00', '2026-07-10T08:36:00+09:00', '2026-07-10T08:48:00+09:00', '2026-07-10T09:00:00+09:00', '2026-07-10T09:11:00+09:00', '2026-07-10T09:20:00+09:00', '2026-07-10T09:30:00+09:00', '2026-07-10T09:40:00+09:00', '2026-07-10T09:50:00+09:00'], done: 10, history: ['서울대학교병원', '광화문', '경복궁역'] },
  { id: 'complete12', plate: '34자 7412', route: 'songpa', courierId: 'c13', location: '배송 완료 운행 종료', eta: '완료', status: '완료', routeStartedAt: '2026-07-10T06:50:00+09:00', actualArrivals: ['2026-07-10T07:26:00+09:00', '2026-07-10T07:35:00+09:00', '2026-07-10T07:44:00+09:00', '2026-07-10T07:53:00+09:00', '2026-07-10T08:03:00+09:00', '2026-07-10T08:14:00+09:00', '2026-07-10T08:22:00+09:00', '2026-07-10T08:31:00+09:00', '2026-07-10T08:40:00+09:00', '2026-07-10T08:49:00+09:00', '2026-07-10T08:58:00+09:00', '2026-07-10T09:08:00+09:00'], done: 12, history: ['잠실역', '석촌호수', '삼성서울병원'] },
];

export const dispatchedDemoVehicles = demoVehicles.filter((vehicle) => vehicle.routeStartedAt !== null);
export const controlDemoVehicles = [...dispatchedDemoVehicles].sort((left, right) => {
  if (left.status === '완료') return right.status === '완료' ? 0 : 1;
  if (right.status === '완료') return -1;
  return right.done - left.done;
});

export function vehiclesForCourier(courierId: string): DemoVehicle[] {
  return demoVehicles.filter((vehicle) => vehicle.courierId === courierId);
}


export const medicalCargo = ['백신 보냉박스', '진단키트 냉장 검체', '의약품 리필 세트', '연구 장비 팔레트', '소모품 정기배송', '온도기록계', '검체 운송 키트', 'POD 서류함'];

export function cargoFor(sequence: number): { name: string; qty: number }[] {
  return Array.from({ length: 3 + (sequence % 4) }, (_, index) => ({
    name: medicalCargo[(sequence + index * 2) % medicalCargo.length],
    qty: 1 + ((sequence + index) % 8),
  }));
}


export function vehicleTone(vehicle: DemoVehicle): 'blue' | 'green' | 'gray' {
  if (vehicle.status === '완료') return 'gray';
  if (vehicle.status === '이동중' || vehicle.status === '하차중') return 'green';
  return 'blue';
}

export function selectedDemoVehicle(): DemoVehicle {
  return demoVehicles.find((vehicle) => vehicle.id === 'depart01') ?? demoVehicles[0];
}

export function stopTone(vehicle: DemoVehicle, sequence: number): 'blue' | 'green' | 'gray' {
  if (sequence <= vehicle.done) return 'gray';
  if (sequence === Math.min(vehicle.done + 1, routeStops[vehicle.route].length)) return 'green';
  return 'blue';
}
