import logging
import os

from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.template.loader import render_to_string
from django.core.exceptions import ValidationError

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from users.permissions import IsAdminOrStaff

from .models import (
    Company, CompanyInvitation, Form, Feedback, BasicData, Address, ContactPerson,
    StandDetails, BasicEquipment, ExtendedEquipment, Workshop, Jobwall,
    Description, FinalData, Lunch, PDI, PDIAttendee, Exhibitor,
)
from .serializers import (
    CompanySerializer, CompanyInvitationSerializer, CompanyRegistrationSerializer,
    FormSerializer, FeedbackSerializer, BasicDataSerializer, AddressSerializer,
    ContactPersonSerializer, StandDetailsSerializer, BasicEquipmentSerializer,
    ExtendedEquipmentSerializer, WorkshopSerializer, JobwallSerializer,
    DescriptionSerializer, FinalDataSerializer, LunchSerializer,
    PDISerializer, PDIAttendeeSerializer, ExhibitorSerializer,
    Stage1Serializer, Stage2Serializer, Stage5Serializer,
)

logger = logging.getLogger(__name__)


def validate_company_id(company_id):
    """Validate that company_id is a valid integer."""
    try:
        return int(company_id)
    except (ValueError, TypeError):
        raise ValidationError("company_id must be a valid integer")


def validate_stage_num(stage_num):
    """Validate that stage_num is between 1 and 5."""
    try:
        stage = int(stage_num)
        if stage not in [1, 2, 3, 4, 5]:
            raise ValidationError("stage_num must be between 1 and 5")
        return stage
    except (ValueError, TypeError):
        raise ValidationError("stage_num must be a valid integer")

# --- COMPANY VIEWS ---
class CompanyListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrStaff]
    """
    List all companies or create a new company.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        companies = Company.objects.all()
        serializer = CompanySerializer(companies, many=True)
        return Response(serializer.data)
    
    def post(self, request):
        serializer = CompanySerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CompanyDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrStaff]
    """
    Retrieve, update or delete a company instance.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, id):
        try:
            validate_company_id(id)
            company = Company.objects.get(id=id)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in CompanyDetailView.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving the company"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        serializer = CompanySerializer(company)
        return Response(serializer.data)
    
    def put(self, request, id):
        try:
            validate_company_id(id)
            company = Company.objects.get(id=id)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in CompanyDetailView.put: {e}", exc_info=True)
            return Response({"detail": "An error occurred while updating the company"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        serializer = CompanySerializer(company, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, id):
        try:
            validate_company_id(id)
            company = Company.objects.get(id=id)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in CompanyDetailView.delete: {e}", exc_info=True)
            return Response({"detail": "An error occurred while deleting the company"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        company.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class CompanyInvitationView(generics.CreateAPIView):
    serializer_class = CompanyInvitationSerializer
    queryset = CompanyInvitation.objects.all()
    permission_classes = [IsAuthenticated, IsAdminOrStaff]

    def perform_create(self, serializer):
        invitation = serializer.save()
        
        # Get language from invitation model (default to English)
        language = invitation.language or 'en'
        if language not in ['en', 'pl']:
            language = 'en'
        
        # Get registration link with language parameter
        registration_link = f"{settings.FRONTEND_BASE_URL}/auth/register?token={invitation.token}&lang={language}"
        # Use backend URL for static files (logo is hosted on backend)
        backend_url = os.environ.get('BACKEND_BASE_URL', 'http://localhost:8000')
        logo_url = f"{backend_url}{settings.STATIC_URL}images/ITP_LOGO_horizontal_black.png"

        # Select template based on language
        template_name = f"emails/invitation_{language}.html"

        # Subject and plain text based on language
        if language == 'pl':
            subject = "Zaproszenie do firmy - ITP System"
            plain_message = f"""Zostałeś zaproszony do platformy dla wystawców Inżynierkisch targów Pracy. 
                            Twój unikalny login: 
                            {invitation.company_name}
                            Aby dokończyć rejestrację, kliknij poniższy link i ustaw hasło:
                            {registration_link}
                            Link do zaproszenia wygaśnie za 7 dni.
                            Jeśli nie spodziewałeś się tego zaproszenia, możesz zignorować tę wiadomość."""
        else:
            subject = "Company Invitation - ITP System"
            plain_message = f"""You have been invited to join the ITP System platform for exhibitors of the Engineering Job Fair.
                            Your unique login: 
                            {invitation.company_name}
                            To complete your registration, click the link below and set your password:
                            {registration_link}
                            This invitation link will expire in 7 days.
                            If you did not expect this invitation, you can safely ignore this email."""

        # Render HTML template
        html_content = render_to_string(template_name, {
            'company_name': invitation.company_name,
            'registration_link': registration_link,
            'logo_url': logo_url,
        })

        # Send email with HTML and plain text alternatives
        email_message = EmailMultiAlternatives(
            subject=subject,
            body=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[invitation.email],
        )
        email_message.attach_alternative(html_content, "text/html")
        email_message.send()


class CompanyRegistrationView(APIView):
    authentication_classes = []
    permission_classes = []
    
    def get(self, request, *args, **kwargs):
        token = request.query_params.get("token")
        if not token:
            return Response({"detail": "Token parameter is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            invitation = CompanyInvitation.objects.get(token=token, is_accepted=False)
            if invitation.is_expired():
                return Response({"detail": "Invitation has expired"}, status=status.HTTP_400_BAD_REQUEST)
            return Response({
                "company_name": invitation.company_name,
                "email": invitation.email,
                "company_status": invitation.company_status
            })
        except CompanyInvitation.DoesNotExist:
            return Response({"detail": "Invalid or already used invitation token"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in CompanyRegistrationView.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while processing the invitation"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def post(self, request, *args, **kwargs):
        token = request.data.get("token")
        if not token:
            return Response({"detail": "Token is required"}, status=status.HTTP_400_BAD_REQUEST)
        data = request.data.copy()
        serializer = CompanyRegistrationSerializer(data=data)
        try:
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response({"message": "Company registration successful"}, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Error in CompanyRegistrationView.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred during registration"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# FORMS
class FormStage1View(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            basic_data = BasicData.objects.get(company=company)
            address = Address.objects.filter(form=basic_data).first()
            contact = ContactPerson.objects.filter(form=basic_data).first()
            return Response({
                'basic_data': BasicDataSerializer(basic_data).data,
                'address': AddressSerializer(address).data if address else None,
                'contact_person': ContactPersonSerializer(contact).data if contact else None,
            })
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except BasicData.DoesNotExist:
            return Response({"detail": "Basic data not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage1View.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving stage 1 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    def post(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage1View.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred while creating stage 1 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        Form.objects.get_or_create(company=company)
        data = request.data.copy()
        if 'basic_data' in data:
            data['basic_data']['company'] = company.id
        serializer = Stage1Serializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    def patch(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if form.stage_1_completed:
                return Response({"detail": "Stage 1 is already completed and cannot be modified"}, status=status.HTTP_403_FORBIDDEN)
            basic_data = BasicData.objects.get(company=company)
            address = Address.objects.filter(form=basic_data).first()
            contact = ContactPerson.objects.filter(form=basic_data).first()
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except BasicData.DoesNotExist:
            return Response({"detail": "Basic data not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage1View.patch: {e}", exc_info=True)
            return Response({"detail": "An error occurred while updating stage 1 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        serializer = Stage1Serializer(
            {'basic_data': basic_data, 'address': address, 'contact_person': contact},
            data=request.data,
            partial=True
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class FormStage2View(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            stand = StandDetails.objects.get(company=company)
            basic = BasicEquipment.objects.filter(stand_details=stand).first()
            ext = ExtendedEquipment.objects.filter(stand_details=stand).first()
            return Response({
                'stand_details': StandDetailsSerializer(stand).data,
                'basic_equipment': BasicEquipmentSerializer(basic).data if basic else None,
                'extended_equipment': ExtendedEquipmentSerializer(ext).data if ext else None,
            })
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except StandDetails.DoesNotExist:
            return Response({"detail": "Stand details not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage2View.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving stage 2 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    def post(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if not form.can_access_stage_2():
                return Response({"detail": "Stage 1 must be completed before accessing stage 2"}, status=status.HTTP_400_BAD_REQUEST)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage2View.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred while creating stage 2 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        data = request.data.copy()
        if 'stand_details' in data:
            data['stand_details']['company'] = company.id
        serializer = Stage2Serializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    def patch(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if form.stage_2_completed:
                return Response({"detail": "Stage 2 is already completed and cannot be modified"}, status=status.HTTP_403_FORBIDDEN)
            stand = StandDetails.objects.get(company=company)
            basic = BasicEquipment.objects.filter(stand_details=stand).first()
            ext = ExtendedEquipment.objects.filter(stand_details=stand).first()
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except StandDetails.DoesNotExist:
            return Response({"detail": "Stand details not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage2View.patch: {e}", exc_info=True)
            return Response({"detail": "An error occurred while updating stage 2 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        serializer = Stage2Serializer({'stand_details': stand, 'basic_equipment': basic, 'extended_equipment': ext}, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class FormStage3View(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            workshop = Workshop.objects.get(company=company)
            return Response(WorkshopSerializer(workshop).data)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Workshop.DoesNotExist:
            return Response({"detail": "Workshop data not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage3View.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving stage 3 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def post(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if not form.can_access_stage_3():
                return Response({"detail": "Previous stages must be completed before accessing stage 3"}, status=status.HTTP_400_BAD_REQUEST)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage3View.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred while creating stage 3 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        data = request.data.copy()
        data['company'] = company.id
        serializer = WorkshopSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def patch(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if form.stage_3_completed:
                return Response({"detail": "Stage 3 is already completed and cannot be modified"}, status=status.HTTP_403_FORBIDDEN)
            workshop = Workshop.objects.get(company=company)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Workshop.DoesNotExist:
            return Response({"detail": "Workshop data not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage3View.patch: {e}", exc_info=True)
            return Response({"detail": "An error occurred while updating stage 3 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        serializer = WorkshopSerializer(workshop, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class FormStage4View(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            jobwall = Jobwall.objects.get(company=company)
            return Response(JobwallSerializer(jobwall).data)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Jobwall.DoesNotExist:
            return Response({"detail": "Jobwall data not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage4View.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving stage 4 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def post(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if not form.can_access_stage_4():
                return Response({"detail": "Previous stages must be completed before accessing stage 4"}, status=status.HTTP_400_BAD_REQUEST)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage4View.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred while creating stage 4 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        data = request.data.copy()
        data['company'] = company.id
        serializer = JobwallSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def patch(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if form.stage_4_completed:
                return Response({"detail": "Stage 4 is already completed and cannot be modified"}, status=status.HTTP_403_FORBIDDEN)
            jobwall = Jobwall.objects.get(company=company)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Jobwall.DoesNotExist:
            return Response({"detail": "Jobwall data not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage4View.patch: {e}", exc_info=True)
            return Response({"detail": "An error occurred while updating stage 4 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        serializer = JobwallSerializer(jobwall, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class FormStage5View(APIView):
    permission_classes = [IsAuthenticated]

    def get_objects(self, company):
        """
        Pobiera obiekty dla Stage 5
        """
        final_data = FinalData.objects.filter(company=company).first()
        form = Form.objects.filter(company=company).first()

        return {
            'description': Description.objects.filter(company=company).first(),
            'final_data': final_data,
            'lunches': Lunch.objects.filter(form=final_data) if final_data else [],
            'exhibitors': Exhibitor.objects.filter(form=form) if form else []
        }

    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage5View.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving stage 5 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        objects = self.get_objects(company)
        if not objects['description'] or not objects['final_data']:
            return Response({"detail": "No Stage 5 data found"}, status=status.HTTP_404_NOT_FOUND)

        pdi = objects['final_data'].pdis if hasattr(objects['final_data'], 'pdis') else None
        pdi_attendees = pdi.pdiattendees.all() if pdi else []

        data = {
            'description': DescriptionSerializer(objects['description']).data,
            'final_data': FinalDataSerializer(objects['final_data']).data,
            'lunches': LunchSerializer(objects['lunches'], many=True).data,
            'pdi': PDISerializer(pdi).data if pdi else None,
            'pdi_attendees': PDIAttendeeSerializer(pdi_attendees, many=True).data,
            'exhibitors': ExhibitorSerializer(objects['exhibitors'], many=True).data,
        }
        return Response(data)

    def post(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if not form.can_access_stage_5():
                return Response({"detail": "Previous stages must be completed before accessing stage 5"}, status=status.HTTP_400_BAD_REQUEST)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage5View.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred while creating stage 5 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        data = request.data.copy()
        if 'description' in data:
            data['description']['company'] = company.id
        if 'final_data' in data:
            data['final_data']['company'] = company.id

        serializer = Stage5Serializer(data=data, context={'company': company})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if form.stage_5_completed:
                return Response({"detail": "Stage 5 is already completed and cannot be modified"}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found or you don't have permission"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormStage5View.patch: {e}", exc_info=True)
            return Response({"detail": "An error occurred while updating stage 5 data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        objects = self.get_objects(company)
        if not objects['description'] or not objects['final_data']:
            return Response({"detail": "Use POST to create data first"}, status=status.HTTP_404_NOT_FOUND)

        pdi = objects['final_data'].pdis if hasattr(objects['final_data'], 'pdis') else None
        pdi_attendees = list(pdi.pdiattendees.all()) if pdi else []

        instance_data = {
            'description': objects['description'],
            'final_data': objects['final_data'],
            'lunches': list(objects['lunches']),
            'pdi': pdi,
            'pdi_attendees': pdi_attendees,
            'exhibitors': list(objects['exhibitors'])
        }

        serializer = Stage5Serializer(instance_data, data=request.data, partial=True, context={'company': company})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# akcpetacja FR + feedback
class FormReviewView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, company_id, stage_num):
        try:
            validate_company_id(company_id)
            validate_stage_num(stage_num)
            company = Company.objects.get(id=company_id)
            if company.fr_resp != request.user:
                return Response({"detail": "You don't have permission to review this company's forms"}, status=status.HTTP_403_FORBIDDEN)
            form = Form.objects.get(company=company)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found"}, status=status.HTTP_404_NOT_FOUND)
        except Form.DoesNotExist:
            return Response({"detail": "Form not found for this company"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in FormReviewView.post: {e}", exc_info=True)
            return Response({"detail": "An error occurred while processing the review"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        feedback_data = {
            'company': company.id,
            'form': f'stage_{stage_num}',
            'status': request.data.get('status', 'pending'),
            'comment': request.data.get('comment', '')
        }
        serializer = FeedbackSerializer(data=feedback_data)
        if serializer.is_valid():
            feedback = serializer.save()
            setattr(form, f'stage_{stage_num}_completed', (feedback.status == 'akcept'))
            form.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# wszystkie feedbacki
class CompanyFeedbackListView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, company_id):
        try:
            validate_company_id(company_id)
            company = Company.objects.get(id=company_id)
            if company.representative != request.user and company.fr_resp != request.user:
                return Response({"detail": "You don't have permission to view feedbacks for this company"}, status=status.HTTP_403_FORBIDDEN)
            feedbacks = Feedback.objects.filter(company=company).order_by('-id')
            return Response(FeedbackSerializer(feedbacks, many=True).data)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Company.DoesNotExist:
            return Response({"detail": "Company not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error in CompanyFeedbackListView.get: {e}", exc_info=True)
            return Response({"detail": "An error occurred while retrieving feedbacks"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)