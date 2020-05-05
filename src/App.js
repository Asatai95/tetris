import React from 'react';
import { ConnectedRouter } from 'react-router-redux';
import { Route } from 'react-router';

import Main from './pages/main';
import Game from './pages/game';

type Props = {
  history: any,
};

export default (props: Props) => (
  <ConnectedRouter history={props.history}>
    <div>
      <Route exact path="/" component={Main} />
      <Route path="/game" component={Game} />
    </div>
  </ConnectedRouter>
);