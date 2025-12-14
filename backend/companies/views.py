from django.shortcuts import render, get_object_or_404
from .models import (
    Company, CompanyInvitation, Form, Feedback, BasicData, Adress, ContactPerson,
    StandDetails, BasicEquipment, ExtendedEqupment, Workshop, Jobwall,
    Description, FinalData, Lunch, PDI, PDIAttendee, Exhibitor,
)
from .serializers import (
    CompanySerializer, CompanyInvitationSerializer, CompanyRegistrationSerializer,
    FormSerializer, FeedbackSerializer, BasicDataSerializer, AdressSerializer,
    ContactPersonSerializer, StandDetailsSerializer, BasicEquipmentSerializer,
    ExtendedEquipmentSerializer, WorkshopSerializer, JobwallSerializer,
    DescriptionSerializer, FinalDataSerializer, LunchSerializer,
    PDISerializer, PDIAttendeeSerializer, ExhibitorSerializer,
    Stage1Serializer, Stage2Serializer, Stage5Serializer,
)
from django.http import HttpResponse, JsonResponse
from rest_framework.parsers import JSONParser
from django.views.decorators.csrf import csrf_exempt
from django.core.mail import send_mail
from django.conf import settings
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from users.permissions import IsAdminOrStaff

# --- COMPANY VIEWS ---
@csrf_exempt
def company_list(request):
    if request.method == "GET":
        companies = Company.objects.all()
        serializer = CompanySerializer(companies, many=True)
        return JsonResponse(serializer.data, safe=False)
    elif request.method == "POST":
        data = JSONParser().parse(request)
        serializer = CompanySerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return JsonResponse(serializer.data, status=201)
        return JsonResponse(serializer.errors, status=400)

@csrf_exempt
def company(request, id):
    try:
        company = Company.objects.get(id=id)
    except Company.DoesNotExist:
        return HttpResponse(status=404)
    if request.method == "GET":
        serializer = CompanySerializer(company)
        return JsonResponse(serializer.data)
    elif request.method == "PUT":
        data = JSONParser().parse(request)
        serializer = CompanySerializer(company, data=data)
        if serializer.is_valid():
            serializer.save()
            return JsonResponse(serializer.data)
        return JsonResponse(serializer.errors, status=400)
    elif request.method == "DELETE":
        company.delete()
        return HttpResponse(status=204)

class CompanyInvitationView(generics.CreateAPIView):
    serializer_class = CompanyInvitationSerializer
    queryset = CompanyInvitation.objects.all()
    permission_classes = [IsAuthenticated, IsAdminOrStaff]
    def perform_create(self, serializer):
        invitation = serializer.save()
        registration_link = f"{settings.FRONTEND_BASE_URL}/auth/register?token={invitation.token}"
        message = f"Company: {invitation.company_name}\nLink: {registration_link}"
        send_mail("Invitation", message, "bs@bs.com", [invitation.email])

class CompanyRegistrationView(APIView):
    authentication_classes = []
    permission_classes = []
    def get(self, request, *args, **kwargs):
        token = request.query_params.get("token")
        if not token: return Response(status=400)
        try:
            invitation = CompanyInvitation.objects.get(token=token, is_accepted=False)
            return Response({"company_name": invitation.company_name, "email": invitation.email, "company_status": invitation.company_status})
        except CompanyInvitation.DoesNotExist: return Response(status=404)
    def post(self, request, *args, **kwargs):
        token = request.data.get("token")
        if not token: return Response(status=400)
        data = request.data.copy()
        serializer = CompanyRegistrationSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"message": "Success"}, status=201)

# FORMS
class FormStage1View(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id, representative=request.user)
            basic_data = BasicData.objects.get(company=company)
            address = Adress.objects.filter(form=basic_data).first()
            contact = ContactPerson.objects.filter(form=basic_data).first()
            return Response({
                'basic_data': BasicDataSerializer(basic_data).data,
                'address': AdressSerializer(address).data if address else None,
                'contact_person': ContactPersonSerializer(contact).data if contact else None,
            })
        except: return Response(status=404)
    def post(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id, representative=request.user)
        except: return Response(status=404)
        Form.objects.get_or_create(company=company)
        data = request.data.copy()
        if 'basic_data' in data: data['basic_data']['company'] = company.id
        serializer = Stage1Serializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)
    def patch(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if form.stage_1_completed: return Response(status=403)
            basic_data = BasicData.objects.get(company=company)
            address = Adress.objects.filter(form=basic_data).first()
            contact = ContactPerson.objects.filter(form=basic_data).first()
        except: return Response(status=404)
        serializer = Stage1Serializer({'basic_data': basic_data, 'address': address, 'contact_person': contact}, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

class FormStage2View(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id, representative=request.user)
            stand = StandDetails.objects.get(company=company)
            basic = BasicEquipment.objects.filter(stand_details=stand).first()
            ext = ExtendedEqupment.objects.filter(stand_details=stand).first()
            return Response({
                'stand_details': StandDetailsSerializer(stand).data,
                'basic_equipment': BasicEquipmentSerializer(basic).data if basic else None,
                'extended_equipment': ExtendedEquipmentSerializer(ext).data if ext else None,
            })
        except: return Response(status=404)
    def post(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if not form.can_access_stage_2(): return Response(status=400)
        except: return Response(status=404)
        data = request.data.copy()
        if 'stand_details' in data: data['stand_details']['company'] = company.id
        serializer = Stage2Serializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)
    def patch(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if form.stage_2_completed: return Response(status=403)
            stand = StandDetails.objects.get(company=company)
            basic = BasicEquipment.objects.filter(stand_details=stand).first()
            ext = ExtendedEqupment.objects.filter(stand_details=stand).first()
        except: return Response(status=404)
        serializer = Stage2Serializer({'stand_details': stand, 'basic_equipment': basic, 'extended_equipment': ext}, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

class FormStage3View(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id, representative=request.user)
            return Response(WorkshopSerializer(Workshop.objects.get(company=company)).data)
        except: return Response(status=404)
    def post(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if not form.can_access_stage_3(): return Response(status=400)
        except: return Response(status=404)
        data = request.data.copy()
        data['company'] = company.id
        serializer = WorkshopSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)
    def patch(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if form.stage_3_completed: return Response(status=403)
            workshop = Workshop.objects.get(company=company)
        except: return Response(status=404)
        serializer = WorkshopSerializer(workshop, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

class FormStage4View(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            return Response(JobwallSerializer(Jobwall.objects.get(form=form)).data)
        except: return Response(status=404)
    def post(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if not form.can_access_stage_4(): return Response(status=400)
        except: return Response(status=404)
        data = request.data.copy()
        data['form'] = form.id
        serializer = JobwallSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)
    def patch(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if form.stage_4_completed: return Response(status=403)
            jobwall = Jobwall.objects.get(form=form)
        except: return Response(status=404)
        serializer = JobwallSerializer(jobwall, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)


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
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
        except (Company.DoesNotExist, Form.DoesNotExist):
            return Response(status=404)

        objects = self.get_objects(company)
        if not objects['description'] or not objects['final_data']:
            return Response({"detail": "No Stage 5 data found"}, status=404)

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
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if not form.can_access_stage_5(): return Response(status=400)
        except: return Response(status=404)

        data = request.data.copy()
        if 'description' in data: data['description']['company'] = company.id
        if 'final_data' in data: data['final_data']['company'] = company.id

        serializer = Stage5Serializer(data=data, context={'company': company})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def patch(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id, representative=request.user)
            form = Form.objects.get(company=company)
            if form.stage_5_completed: return Response(status=403)
        except: return Response(status=404)

        objects = self.get_objects(company)
        if not objects['description'] or not objects['final_data']:
             return Response({"detail": "Use POST to create data first"}, status=404)

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
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

# akcpetacja FR + feedback
class FormReviewView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, company_id, stage_num):
        try:
            company = Company.objects.get(id=company_id)
            if company.fr_resp != request.user: return Response(status=403)
            form = Form.objects.get(company=company)
        except: return Response(status=404)
        if stage_num not in [1, 2, 3, 4, 5]: return Response(status=400)
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
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

# wszystkie feedbacki
class CompanyFeedbackListView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, company_id):
        try:
            company = Company.objects.get(id=company_id)
            if company.representative != request.user and company.fr_resp != request.user: return Response(status=403)
            feedbacks = Feedback.objects.filter(company=company).order_by('-id')
            return Response(FeedbackSerializer(feedbacks, many=True).data)
        except: return Response(status=404)