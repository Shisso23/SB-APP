export const levels: Number [] = [0,1,2,3,4,5];

export  const betOptions: {name: String; id: Number, level: Number, shortName: String } [] = [{name: 'Both Teams to Score', id: 0, shortName: 'BTTS', level:3}, {name: 'Home', id: 1, level: 3, shortName: 'Home' }, {name: 'Home over 1.5', id: 2, level: 3, shortName: 'H.Over 1.5'},
{name: 'over 1.5', id: 3, level: 1, shortName: 'Over 1.5'}, {name: 'Over 2.5', id: 4, level: 2, shortName: 'Over 2.5'}, {name: 'Home Wins Either Half', id: 5, level: 1, shortName: 'H.W.E.H' }, {name: 'Multi Goals (2-5) Goals', id: 6, level: 2, shortName: '2->5 G'}, {name: 'Multi Goals (3-6) Goals', id: 7, level: 3, shortName: '3->6 G'},
{name: 'Both Halves Over 0.5', id: 8, level: 4, shortName: 'B.H.Over 0.5'}, {name: 'Draw or GG', id: 9, level: 2, shortName: 'DD OR GG'}, {name: 'Draw', id: 10, level: 5, shortName: 'DRAW'}, {name: 'Half-Time Draw', id: 11, level: 4, shortName: 'HT-DRAW'}, {name: 'Away', id: 12, level: 4, shortName: 'Away'}, {name: 'Away over 1.5', id: 13, level: 4, shortName: 'A.Over 1.5'},{ name: 'Away wins either half', id: 14, level: 2, shortName: 'A.W.E.H'}, {name: 'Home over 0.5', id: 15, level: 0, shortName:'H.Over 0.5'}, {name: 'Away over 0.5', id: 16, level: 2, shortName:'A.Over 0.5'}
];

export const numberOfH2HMatchesBack = 5; //TODO Implement this where needed

export const numberOTeamLastFixturesBack = 5; //TODO Implement this where needed

export const numberOfSeasonsBack = 4; //TODO Implement this where needed