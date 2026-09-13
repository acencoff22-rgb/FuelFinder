/**
 * FuelFinder 실질 주유비 계산 엔진
 *
 * 실제 계산 로직은 public/shared/calc.js에 있습니다.
 * 서버와 브라우저(public/index.html)가 같은 계산 로직을 쓰도록
 * 이 파일은 공유 모듈을 그대로 재노출(re-export)만 합니다.
 * 계산 공식을 고치려면 public/shared/calc.js를 수정하세요.
 */
export { calculateFuelCost } from "../public/shared/calc.js";
