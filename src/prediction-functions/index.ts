import { predictMultiGoals0_3 } from "./0-3-goals";
import { predictAwayCleanSheet } from "./away-clean-sheet";
import { predictAwayOrDraw } from "./away-or-draw";
import { predictAwayOver0_5 } from "./away-over-0-5";
import { predictAwayWin } from "./away-win";
import { predictAwayWinsEitherHalf } from "./away-wins-either-half";
import { predictBothTeamsToScore } from "./both-tems-score";
import { predictDraw } from "./draw";
import { predictHTDraw } from "./halft-time-draw";
import { predictHomeCleanSheet } from "./home-clean-sheet";
import { predictHomeOrDraw } from "./home-or-draw";
import { predictHomeOver0_5 } from "./home-over-0-5";
import { predictHomeOver1_5 } from "./home-over-1-5";
import { predictHomeWin } from "./home-win";
import { predictHomeWinsEitherHalf } from "./home-wins-either-half";
import { predictOver1_5 } from "./over-1-5";

export default{
    predictAwayCleanSheet,
    predictHomeCleanSheet,
    predictBothTeamsToScore,
    predictHomeWin,
    predictHomeOver1_5,
    predictOver1_5,
    predictHomeWinsEitherHalf,
    predictDraw,
    predictAwayWin,
    predictHTDraw,
    predictAwayWinsEitherHalf,
    predictHomeOver0_5,
    predictAwayOver0_5,
    predictMultiGoals0_3,
    predictHomeOrDraw,
    predictAwayOrDraw
}

// TODO see how i can export these as module