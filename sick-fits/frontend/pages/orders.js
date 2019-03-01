import React from 'react'

import PleaseSignIn from '../components/PleaseSignIn'
import OrderList from '../components/OrderList'

const OrdersPage = props => (
  <div>
    <PleaseSignIn>
      <OrderList id={props.query.id} />
    </PleaseSignIn>
  </div>
)

export default OrdersPage
