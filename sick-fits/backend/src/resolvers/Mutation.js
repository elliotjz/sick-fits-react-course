const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { randomBytes } = require('crypto')
const { promisify } = require('util')

const { transport, makeANiceEmail } = require('../mail')
const { hasPermission } = require('../utils')
const stripe = require('../stripe')

const Mutation = {
  async createItem(parent, args, ctx, info) {
    // Check if they are logged in
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that.')
    }

    const item = await ctx.db.mutation.createItem({
      data: {
        // this is how we create a relationship between the 
        // item and the user
        user: {
          connect: {
            id: ctx.request.userId
          },
        },
        ...args
      }
    }, info)
    
    return item
  },

  updateItem(parent, args, ctx, info) {
    // first take a copy of the updates
    const updates = { ...args }
    // remove the ID from the updates
    delete updates.id
    // run the update method
    return ctx.db.mutation.updateItem({
      data: updates,
      where: {
        id: args.id
      }
    }, info)
  },

  async deleteItem(parent, args, ctx, info) {
    const where = { id: args.id }
    // Find the item
    const item = await ctx.db.query.item({ where }, `{
      id
      title
      user { id }
    }`)

    // Check if the user owns the item
    const ownsItem = item.user.id === ctx.request.userId
    const hasPermissions = ctx.request.user.permissions.some(
      permissions => ['ADMIN', 'ITEMDELETE'].includes(permissions)
    )
    if (!ownsItem && !hasPermission) {
      throw new Error('You do not have permission to do that')
    }

    // Delete it
    return ctx.db.mutation.deleteItem({ where }, info)
  },

  async signup(parent, args, ctx, info) {
    args.email = args.email.toLowerCase()
    
    // hash their password
    const password = await bcrypt.hash(args.password, 10)

    // create the user in the database
    const user = await ctx.db.mutation.createUser({
        data: {
          ...args,
          password,
          permissions: { set: ['USER'] }
        }
      }, info)
    
    // Create the JWT token for them
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET)

    // Set the JWT as a cookie on the response
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    })

    // Return the user to the browser
    return user
  },

  async signin(parent, {email, password}, ctx, info) {
    // check if there is a user with that email
    const user = await ctx.db.query.user({
      where: { email }
    })
    if (!user) {
      throw new Error(`No such user found for email ${email}`)
    }

    // check if their password is correct
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      throw new Error('Invalid Password!')
    }

    // generate the JWT token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET)

    // Set the cookie with the token
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    })

    // return the user
    return user
  },

  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token')
    return { message: "Goodbye!" }
  },
  
  async requestReset(parent, args, ctx, info) {
    // Check if this is a real user
    const user = await ctx.db.query.user(
      { where: { email: args.email } }
    )
    if (!user) {
      throw new Error(`No such user found for email ${args.email}`)
    }

    // Set a reset token and expiry on that user
    const resetToken = (await promisify(randomBytes)(20)).toString('hex')
    const resetTokenExpiry = Date.now() + 1000 * 60 * 60
    const res = await ctx.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry }
    })

    // Email the reset token
    const mailRes = await transport.sendMail({
      from: 'elliot@gmail.com',
      to: user.email,
      subject: 'Your Password Reset Token',
      html: makeANiceEmail(`
      Your password reset token is here!\n\n
        <a
          href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}"
        >Click Here to Reset</a>
      `)
    })

    // Return the message
    return { message: "Success" }
  },

  async resetPassword(parent, args, ctx, info) {
    // check if the passwords match
    if (args.password !== args.confirmPassword) {
      throw new Error('Passwords do no match.')
    }

    // Get user with the reset token
    // and check that the token s still valid
    const [user] = await ctx.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now(),
      },
    })
    if (!user) {
      throw new Error('Token is not valid.')
    }

    // hash the new password
    const password = await bcrypt.hash(args.password, 10)

    // save the user's password and remove old token fields
    const updatedUser = await ctx.db.mutation.updateUser({
      where: { email: user.email },
      data: {
        password,
        resetToken: null,
        resetTokenExpiry: null,
      }
    })

    // Generate JWT
    const token = jwt.sign({ userId: updatedUser.id },
      process.env.APP_SECRET)

    // Set the JWT cookie
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    })

    // return the new user
    return updatedUser
  },

  async updatePermissions(parent, args, ctx, info) {
    // Check if they are logged in
    if (!ctx.request.userId) {
      throw new Error('You must be logged in the do this.')
    }

    // Query the current user
    const user = await ctx.db.query.user({
      where: { id: ctx.request.userId},
    }, info)

    // Check if they have permissions to do this
    hasPermission(user, ['PERMISSIONUPDATE', 'ADMIN'])

    // Update the permissions
    return ctx.db.mutation.updateUser({
      data: { permissions: {
        set: args.permissions,
      }},
      where: { id: args.userId },
    }, info)
  },

  async addToCart(parent, args, ctx, info) {
    // Make sure they are signed in
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('You must be signed in.')
    }

    // Query the user's current cart
    const [existingCartItem] = await ctx.db.query.cartItems({
      where: {
        user: {id: userId },
        item: { id: args.id },
      }
    })

    // Check if that item is already in their cart
    // increment by 1 if it is already in the cart
    if (existingCartItem) {
      return ctx.db.mutation.updateCartItem({
        where: { id: existingCartItem.id },
        data: { quantity: existingCartItem.quantity + 1 }
      }, info)
    }

    // create a new CartItem for that user
    return ctx.db.mutation.createCartItem({
      data: {
        user: {
          connect: { id: userId },
        },
        item: {
          connect: { id: args.id },
        },
      },
    }, info)
  },

  async removeFromCart(parent, args, ctx, info) {
    // Find the cart item
    const cartItem = await ctx.db.query.cartItem({
      where: {
        id: args.id,
      }
    }, `{ id, user { id }}`)

    // Make sure we found an item
    if (!cartItem) {
      throw new Error('No cart item found.')
    }

    // Make sure the user owns that cart item
    if (cartItem.user.id !== ctx.request.userId) {
      throw new Error('User does not own this cart item.')
    }

    // delete the cart item
    return ctx.db.mutation.deleteCartItem({
      where: {
        id: args.id,
      },
    }, info)
  },

  async createOrder(parent, args, ctx, info) {
    // Query the current user and make sure they are logged in
    const { userId } = ctx.request
    if (!userId) {
      throw new Error('You must be signed in to complete this order.')
    }
    const user = await ctx.db.query.user({ where: { id: userId } },
      `{
        id name email cart {
          id
          quantity
          item {
            title price id description image largeImage
          }
        }
      }`
      )

    // Recalculate the total for the price
    const amount = user.cart.reduce((tally, cartItem) => (
      tally + cartItem.item.price * cartItem.quantity
      ), 0)

    // Create the stripe charge (turn token into money)
    console.log(`Going to charge for a total of ${amount}`)
    const charge = await stripe.charges.create({
      amount,
      currency: 'USD',
      source: args.token,
    })

    // Convert the CartItems or OrderItems
    const orderItems = user.cart.map(cartItem => {
      const orderItem = {
        ...cartItem.item,
        quantity: cartItem.quantity,
        user: {
          connect: {
            id: userId,
          },
        },
      }
      delete orderItem.id
      return orderItem
    })

    // Create the Order
    const order = await ctx.db.mutation.createOrder({
      data: {
        items: { create: orderItems },
        total: charge.amount,
        user: {
          connect: { id: userId },
        },
        charge: charge.id
      }
    })

    // Clean u - clean the user's cart, delete CartItems
    const cartItemIds = user.cart.map(cartItem => cartItem.id)
    await ctx.db.mutation.deleteManyCartItems({
      where: {
        id_in: cartItemIds,
      },
    })

    return order
  },
};

module.exports = Mutation;
