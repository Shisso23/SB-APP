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
import {predict1_2_goals_Away} from "./1-2-goals-away"
import {predict1_2_goals_Home} from "./1-2-golas-home"
import {predict2_3_goals_Away} from "./2-3-goals-away"
import {predict2_3_goals_Home} from "./2-3-goals-home"
import { predict2_4_goals} from "./2-4-goals"
import {predict2_5_goals} from "./2-5-goals"
import {predict3_6_goals} from "./3-6-goals"
import { predictAwayOver1_5 } from "./away-over-1-5";
import { predictOver2_5 } from "./over-2-5";
import {predictOver0_5} from "./over_0_5"
import {predictUnder5_5} from "./under_5_5"
import { predict1_6_goals } from "./1-6-goals";
import { predict2_6_goals } from "./2_6_golas";
import { predict_home_wins_or_BTTS } from "./home-wins-or_BTTS";
import { predict_away_wins_or_BTTS } from "./away-wins-or-BTTS";
import { predictDrawOrBothTeamsScore } from "./draw-or-both-teams-score";
import { predictUnder2_5 } from "./under_2_5";
import { predictUnder3_5 } from "./under_3_5";
import { predictUnder4_5 } from "./under_4_5";

export default{
    predictAwayCleanSheet,
    predictHomeCleanSheet,
    predictBothTeamsToScore,
    predictDrawOrBothTeamsScore,
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
    predictAwayOrDraw,
    predict1_2_goals_Away,
    predict2_3_goals_Away,
    predict1_2_goals_Home,
    predict2_4_goals,
    predict2_5_goals,
    predict2_3_goals_Home,
    predict3_6_goals,
    predictAwayOver1_5,
    predictOver2_5,
    predictOver0_5,
    predictUnder5_5,
    predict1_6_goals,
    predict2_6_goals,
    predict_home_wins_or_BTTS,
    predict_away_wins_or_BTTS,
    predictUnder2_5,
    predictUnder3_5,
    predictUnder4_5,

}

// TODO see how i can export these as module