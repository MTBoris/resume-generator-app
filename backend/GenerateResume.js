const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const ses = new AWS.SES({ region: 'us-east-1' });
const { OpenAI } = require('openai');

// Инициализация OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async (event) => {
  try {
    // Парсинг данных из запроса
    const data = JSON.parse(event.body);
    const { userInfo, documentType, language, orderID, email } = data;

    // Генерация резюме или сопроводительного письма с помощью OpenAI
    let prompt;
    
    if (documentType === 'resume' || documentType === 'both') {
      prompt = `Create a professional resume in English based on the following information:\n\n`;
      prompt += `Full Name: ${userInfo.fullName}\n`;
      prompt += `City/Country: ${userInfo.location}\n`;
      prompt += `Phone: ${userInfo.phone}\n`;
      prompt += `Email: ${userInfo.email}\n`;
      prompt += `Job Target: ${userInfo.jobTitle} at ${userInfo.company}\n`;
      prompt += `Objective: ${userInfo.objective}\n\n`;
      
      // Опыт работы
      if (userInfo.experience && userInfo.experience.length > 0) {
        prompt += `Work Experience:\n`;
        userInfo.experience.forEach(job => {
          prompt += `- ${job.title} at ${job.company}, ${job.location}, ${job.startDate} - ${job.endDate}\n`;
          prompt += `  Responsibilities & Achievements: ${job.description}\n`;
        });
        prompt += `\n`;
      }
      
      // Образование
      if (userInfo.education && userInfo.education.length > 0) {
        prompt += `Education:\n`;
        userInfo.education.forEach(edu => {
          prompt += `- ${edu.degree} from ${edu.institution}, ${edu.location}, ${edu.dates}\n`;
        });
        prompt += `\n`;
      }
      
      // Навыки
      if (userInfo.skills) {
        prompt += `Skills:\n`;
        prompt += `- Technical: ${userInfo.skills.technical.join(', ')}\n`;
        prompt += `- Languages: ${userInfo.skills.languages.join(', ')}\n`;
        prompt += `- Soft Skills: ${userInfo.skills.soft.join(', ')}\n\n`;
      }
      
      // Сертификаты
      if (userInfo.certificates && userInfo.certificates.length > 0) {
        prompt += `Certificates:\n`;
        userInfo.certificates.forEach(cert => {
          prompt += `- ${cert.name} from ${cert.issuer}, ${cert.year}\n`;
        });
        prompt += `\n`;
      }
      
      prompt += `Make the resume professional, concise, and achievement-oriented. Format it properly with clear sections.`;
    } 
    
    if (documentType === 'coverLetter' || documentType === 'both') {
      const coverLetterPrompt = `Create a professional cover letter in English based on the following information:\n\n`;
      coverLetterPrompt += `Full Name: ${userInfo.fullName}\n`;
      coverLetterPrompt += `City/Country: ${userInfo.location}\n`;
      coverLetterPrompt += `Phone: ${userInfo.phone}\n`;
      coverLetterPrompt += `Email: ${userInfo.email}\n`;
      coverLetterPrompt += `Job Target: ${userInfo.jobTitle} at ${userInfo.company}\n`;
      coverLetterPrompt += `Objective: ${userInfo.objective}\n\n`;
      
      // Образование для краткости
      if (userInfo.education && userInfo.education.length > 0) {
        coverLetterPrompt += `Education: ${userInfo.education[0].degree} from ${userInfo.education[0].institution}\n\n`;
      }
      
      // Ключевые навыки
      if (userInfo.skills) {
        coverLetterPrompt += `Key Skills: ${userInfo.skills.technical.slice(0, 3).join(', ')}\n\n`;
      }
      
      coverLetterPrompt += `Make the cover letter professional, persuasive, and tailored to the job. Keep it to one page, addressing the hiring manager professionally. Express enthusiasm for the role.`;
      
      if (documentType === 'coverLetter') {
        prompt = coverLetterPrompt;
      } else {
        // Если оба документа, генерируем отдельным запросом
        const coverLetterCompletion = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            {"role": "system", "content": "You are a professional resume/cover letter writer."},
            {"role": "user", "content": coverLetterPrompt}
          ]
        });
        
        const coverLetterText = coverLetterCompletion.choices[0].message.content;
        
        // Сохранить в DynamoDB для использования позже
        await dynamodb.put({
          TableName: 'Orders',
          Item: {
            OrderID: orderID + "_coverLetter",
            UserEmail: email,
            DocumentType: "coverLetter",
            Content: coverLetterText,
            CreatedAt: new Date().toISOString(),
            Status: 'completed'
          }
        }).promise();
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {"role": "system", "content": "You are a professional resume/cover letter writer."},
        {"role": "user", "content": prompt}
      ]
    });

    const generatedText = completion.choices[0].message.content;

    // В реальном приложении здесь был бы код для создания PDF

    // Сохранение информации о заказе в DynamoDB
    await dynamodb.put({
      TableName: 'Orders',
      Item: {
        OrderID: orderID,
        UserEmail: email,
        DocumentType: documentType,
        Content: generatedText,
        CreatedAt: new Date().toISOString(),
        Status: 'completed'
      }
    }).promise();

    // В реальном приложении здесь был бы код для отправки PDF по email

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        message: 'Document generated successfully',
        orderID: orderID,
        preview: generatedText
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
      body: JSON.stringify({ error: 'Failed to generate document' })
    };
  }
};
