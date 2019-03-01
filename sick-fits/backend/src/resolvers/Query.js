const { forwardTo } = require('prisma-binding')

const { hasPermission } = require('../utils')

const Query = {
  items: forwardTo('db'),
  item: forwardTo('db'),
  itemsConnection: forwardTo('db'),
  me(parent, args, ctx, info) {
    // check if there is a current user ID
    if (!ctx.request.userId) return null
    
    return ctx.db.query.user(
      {
        where: { id: ctx.request.userId },
      },
      info)
  },

  async users(parent, args, ctx, info) {
    // Check if they are logged in
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do this.')
    }
    
    // Check if the user has the permissions to
    // query the users
    hasPermission(ctx.request.user, ['ADMIN', 'PERMISSIONUPDATE'])

    // Query all the users
    return ctx.db.query.users({}, info)
  },

  async order(parent, args, ctx, info) {
    // make sure they are logged in
    if (!ctx.request.userId) {
      throw new Error('You must be logged in.')
    }
    
    // Query the current order
    const order = await ctx.db.query.order({
      where: { id: args.id },
    }, info)
    
    // check that the user has the permissions to see the order
    const ownsOrder = order.user.id === ctx.request.userId
    const hasPermissionsToSeeOrder = ctx.request.user.permissions
    .includes('ADMIN')
    if (!ownsOrder && !hasPermissionsToSeeOrder) {
      throw new Error("User doesn't have permissions to view order.")
    }
    
    // return the order
    return order
  },
  
  async orders(parent, args, ctx, info) {
    // Check that the user is logged in
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('You must be logged in.')
    }
    
    // Get user's orders
    return ctx.db.query.orders({
      where: {
        user: { id: userId}
      }
    }, info)
  }
};

module.exports = Query;
