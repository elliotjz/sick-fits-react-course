import { mount } from 'enzyme'
import toJSON from 'enzyme-to-json'
import wait from 'waait'
import { MockedProvider } from 'react-apollo/test-utils'

import SingleItem, { SINGLE_ITEM_QUERY } from '../components/SingleItem'
import { fakeItem } from '../lib/testUtils'

describe('<SingleItem/>', () => {
  it('renders with proper data', async () => {
    const mocks = [
      {
        // When someone make a request with these parameters
        request: { query: SINGLE_ITEM_QUERY, variables: { id: '123' } },
        result: {
          data: {
            item: fakeItem(),
          },
        },
      },
    ]

    const wrapper = mount(
      <MockedProvider mocks={mocks}>
        <SingleItem id="123" />
      </MockedProvider>
    )

    expect(wrapper.text()).toContain('Loading...')

    // Put this thread on the bottom of the call stack
    // so that component can update
    await wait()

    wrapper.update()
    expect(toJSON(wrapper.find('h2'))).toMatchSnapshot()
    expect(toJSON(wrapper.find('p'))).toMatchSnapshot()
    expect(toJSON(wrapper.find('img'))).toMatchSnapshot()
  })

  it('Errors with a not found item', async () => {
    const mocks = [
      {
        // When someone make a request with these parameters
        request: { query: SINGLE_ITEM_QUERY, variables: { id: '123' } },
        result: {
          errors: [{ message: 'Item Not Found!' }],
        },
      },
    ]

    const wrapper = mount(
      <MockedProvider mocks={mocks}>
        <SingleItem id="123" />
      </MockedProvider>
    )

    await wait()
    wrapper.update()
    const item = wrapper.find('[data-test="graphql-error"]')
    expect(toJSON(item)).toMatchSnapshot()
  })
})
