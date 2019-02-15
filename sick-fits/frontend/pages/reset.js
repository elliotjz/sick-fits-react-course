import React from 'react'

import ResetComponent from '../components/Reset'

const Reset = props => {
  return (
    <div>
      <p>Reset your password</p>
      <ResetComponent resetToken={props.query.resetToken} />
    </div>
  )
}

export default Reset
