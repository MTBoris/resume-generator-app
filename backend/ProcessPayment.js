const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    const data = JSON.parse(event.body);
    const { token, amount, documentType, userInfo } = data;

    // Создание платежа в Stripe
    const payment = await stripe.charges.create({
      amount: Math.round(amount * 100), // Stripe работает с центами
      currency: 'usd',
      description: `Payment for ${documentType}`,
      source: token
    });

    const orderID = uuidv4();

    // Сохранение информации о платеже в DynamoDB
    await dynamodb.put({
      TableName: 'Orders',
      Item: {
        OrderID: orderID,
        PaymentID: payment.id,
        UserEmail: userInfo.email,
        Amount: amount,
        DocumentType: documentType,
        CreatedAt: new Date().toISOString(),
        Status: 'paid'
      }
    }).promise();

    // Сохранение информации о пользователе
    await dynamodb.put({
      TableName: 'Users',
      Item: {
        UserID: userInfo.email,
        FullName: userInfo.fullName,
        Location: userInfo.location,
        Phone: userInfo.phone,
        CreatedAt: new Date().toISOString(),
        LastOrder: orderID
      }
    }).promise();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: true,
        orderID: orderID 
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Payment processing failed' })
    };
  }
};
