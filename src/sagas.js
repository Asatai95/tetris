import {
    race,
    take,
    put,
    fork,
    select,
    cancel,
    takeLatest,
  } from 'redux-saga/effects';
  import { push } from 'react-router-redux';
  import 'seedrandom';

  import * as Config from './game/config';
  import * as Actions from './actions';
  import * as Types from './types';
  import * as Keys from './game/keys';
  import * as Board from './game/board';
  import Piece from './game/Piece';
  import { dispatch } from './store';

  const SLACK_TIME = 30;

  export function* showModal({ title, cancelable = false }) {
    yield put(Actions.setModal({ show: true, title, cancelable }));
    let answer;
    do {
      answer = yield race({
        ok: take(Types.UI_MODAL_OK),
        cancel: take(Types.UI_MODAL_CANCEL),
        keyDown: take(Types.UI_KEY_DOWN),
      });
    } while (
      !answer.ok &&
      !answer.cancel &&
      !(answer.keyDown && answer.keyDown.payload === Keys.KEY_ENTER) &&
      !(answer.keyDown && answer.keyDown.payload === Keys.KEY_ESC)
    );
    yield put(Actions.setModal({ show: false }));
    return answer;
  }

  export function* gameOver() {
    yield* showModal({ title: 'GAME OVER' });
  }

  export function* gameQuit() {
    const answer = yield* showModal({
      title: 'QUIT THE GAME?',
      cancelable: true,
    });
    if (
      answer.ok ||
      (answer.keyDown && answer.keyDown.payload === Keys.KEY_ENTER)
    ) {
      yield put(Actions.sysGameQuit());
    }
  }

  export function* gamePause() {
    yield* showModal({ title: 'PAUSE' });
  }

  export function* slackTimeChecker() {
    let slackTime = SLACK_TIME;
    while (true) {
      const { keyDown, timeTick } = yield race({
        keyDown: take(Types.UI_KEY_DOWN),
        timeTick: take(Types.SYS_TIME_TICK),
      });
      if (
        slackTime === 0 ||
        (keyDown && keyDown.payload === Keys.KEY_ARROW_DOWN)
      ) {
        yield put(Actions.sysFixDownPiece());
        return;
      }
      if (timeTick) {
        slackTime -= 1;
      }
    }
  }

  export function* pieceFall() {
    let piece = new Piece(3, 1, Math.floor(Math.random() * 7), 0);
    let board = yield select(state => state.main.board);
    if (!piece.canPut(board)) {
      yield put(Actions.sysGameOver());
      return;
    }
    yield put(Actions.setCurrentPiece(piece));

    let stcTask = null;
    while (true) {
      const { keyDown, fixDown, timeTick } = yield race({
        keyDown: take(Types.UI_KEY_DOWN),
        fixDown: take(Types.SYS_FIX_DOWN_PIECE),
        timeTick: take(Types.SYS_TIME_TICK),
      });
      if (fixDown) {
        board = piece.setTo(board);
        const [newBoard, clearedLines] = Board.clearLines(board);
        board = newBoard;
        yield put(Actions.setBoard(board));
        yield put(Actions.addScore(Config.LINES_SCORE[clearedLines]));
        break;
      }
      if (piece.reachedToBottom(board)) {
        if (stcTask === null) {
          stcTask = yield fork(slackTimeChecker);
        }
      } else if (stcTask !== null) {
        yield cancel(stcTask);
        stcTask = null;
      }
      if (keyDown) {
        if (keyDown.payload === Keys.KEY_Q) {
          yield* gameQuit();
        } else if (keyDown.payload === Keys.KEY_P) {
          yield* gamePause();
        }
      }
      if (keyDown || (timeTick && timeTick.payload % 60 === 0)) {
        const nextPiece = piece.nextPiece(
          (keyDown && keyDown.payload) || Keys.KEY_ARROW_DOWN
        );
        if (nextPiece.canPut(board)) {
          if (
            nextPiece !== piece &&
            keyDown &&
            keyDown.payload === Keys.KEY_ARROW_DOWN
          ) {
            yield put(Actions.addScore(1));
          }
          piece = nextPiece;
          yield put(Actions.setCurrentPiece(piece));
        }
      }
    }
  }

  export function* game() {
    yield put(push('/game'));

    yield put(Actions.setBoard(Board.INITIAL_BOARD));
    yield put(Actions.setScore(0));
    let requestId;
    let n = 0;

    try {
      const loop = arg => {
        dispatch(Actions.sysTimeTick(n++));
        requestId = window.requestAnimationFrame(loop);
      };
      window.requestAnimationFrame(loop);

      while (yield select(state => state.main.gameRunning)) {
        yield* pieceFall();
      }
    } finally {
      window.cancelAnimationFrame(requestId);
    }
  }

  function* demoScreen() {
    if (Config.PREDICTABLE_RANDOM) {
      Math.seedrandom('sagaris');
    }
    yield put(push('/'));

    while (true) {
      while ((yield take(Types.UI_KEY_DOWN)).payload !== Keys.KEY_S) {
        /* do nothinng */
      }
      yield put(Actions.setGameRunning(true));
      yield put(Actions.sysGameStart());
      const gameResult = yield race({
        over: take(Types.SYS_GAME_OVER),
        quit: take(Types.SYS_GAME_QUIT),
      });
      yield put(Actions.setGameRunning(false));
      if (gameResult.over) {
        yield* gameOver();
      }
      yield put(push('/'));
    }
  }

  export default function* rootSaga() {
    yield fork(demoScreen);
    yield takeLatest(Types.SYS_GAME_START, game);
  }