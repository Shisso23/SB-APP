import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import store from './redux/store';
import authNetworkService from './services/auth-network-service/auth-network.service';

jest.mock('./services/auth-network-service/auth-network.service', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { response: [], errors: [], results: 0 } }) },
}));

test('renders the app shell and opens the prediction desk without real network requests', async () => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  const App = require('./App').default;

  render(<Provider store={store}><App /></Provider>, { container: root });
  expect(screen.getByRole('link', { name: 'PREDICTZ' })).toHaveAttribute('href', '/');
  fireEvent.click(screen.getByRole('button', { name: 'Go to Bets' }));
  expect(await screen.findByRole('heading', { name: 'BetSmart Prediction Desk' })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
  expect(authNetworkService.get).toHaveBeenCalledWith('leagues', expect.objectContaining({ params: expect.any(Object) }));
});
